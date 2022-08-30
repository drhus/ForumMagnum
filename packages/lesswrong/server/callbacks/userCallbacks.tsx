import React from 'react';
import fetch from "node-fetch";
import md5 from "md5";
import Users from "../../lib/collections/users/collection";
import { userGetGroups } from '../../lib/vulcan-users/permissions';
import { createMutator, updateMutator } from '../vulcan-lib/mutators';
import { Posts } from '../../lib/collections/posts'
import { Comments } from '../../lib/collections/comments'
import { bellNotifyEmailVerificationRequired } from '../notificationCallbacks';
import { isAnyTest } from '../../lib/executionEnvironment';
import { randomId } from '../../lib/random';
import { getCollectionHooks, UpdateCallbackProperties } from '../mutationCallbacks';
import { voteCallbacks, VoteDocTuple } from '../../lib/voting/vote';
import { encodeIntlError } from '../../lib/vulcan-lib/utils';
import { userFindByEmail } from '../../lib/vulcan-users/helpers';
import { sendVerificationEmail } from "../vulcan-lib/apollo-server/authentication";
import { forumTypeSetting } from "../../lib/instanceSettings";
import { mailchimpEAForumListIdSetting, mailchimpForumDigestListIdSetting } from "../../lib/publicSettings";
import { mailchimpAPIKeySetting } from "../../server/serverSettings";
import { userGetLocation } from "../../lib/collections/users/helpers";
import { captureException } from "@sentry/core";
import { getAdminTeamAccount } from './commentCallbacks';
import { wrapAndSendEmail } from '../emails/renderEmail';
import { DatabaseServerSetting } from "../databaseSettings";
import { EventDebouncer } from '../debouncer';
import { Components } from '../../lib/vulcan-lib/components';
import { Conversations } from '../../lib/collections/conversations/collection';
import { Messages } from '../../lib/collections/messages/collection';
import { getAuth0Profile, updateAuth0Email } from '../authentication/auth0';
import { triggerReviewIfNeeded } from './sunshineCallbackUtils';
import { includes } from 'underscore';
import { FilterSettings, getDefaultFilterSettings } from '../../lib/filterSettings';
import Tags from '../../lib/collections/tags/collection';
import keyBy from 'lodash/keyBy';

const MODERATE_OWN_PERSONAL_THRESHOLD = 50
const TRUSTLEVEL1_THRESHOLD = 2000

voteCallbacks.castVoteAsync.add(async function updateTrustedStatus ({newDocument, vote}: VoteDocTuple) {
  const user = await Users.findOne(newDocument.userId)
  if (user && user.karma >= TRUSTLEVEL1_THRESHOLD && (!userGetGroups(user).includes('trustLevel1'))) {
    await Users.rawUpdateOne(user._id, {$push: {groups: 'trustLevel1'}});
    const updatedUser = await Users.findOne(newDocument.userId)
    //eslint-disable-next-line no-console
    console.info("User gained trusted status", updatedUser?.username, updatedUser?._id, updatedUser?.karma, updatedUser?.groups)
  }
});

voteCallbacks.castVoteAsync.add(async function updateModerateOwnPersonal({newDocument, vote}: VoteDocTuple) {
  const user = await Users.findOne(newDocument.userId)
  if (!user) throw Error("Couldn't find user")
  if (user.karma >= MODERATE_OWN_PERSONAL_THRESHOLD && (!userGetGroups(user).includes('canModeratePersonal'))) {
    await Users.rawUpdateOne(user._id, {$push: {groups: 'canModeratePersonal'}});
    const updatedUser = await Users.findOne(newDocument.userId)
    if (!updatedUser) throw Error("Couldn't find user to update")
    //eslint-disable-next-line no-console
    console.info("User gained trusted status", updatedUser.username, updatedUser._id, updatedUser.karma, updatedUser.groups)
  }
});

getCollectionHooks("Users").editBefore.add(async function UpdateAuth0Email(modifier: MongoModifier<DbUser>, user: DbUser) {
  const newEmail = modifier.$set?.email;
  const oldEmail = user.email;
  if (newEmail && newEmail !== oldEmail && forumTypeSetting.get() === "EAForum") {
    await updateAuth0Email(user, newEmail);
    /*
     * Be careful here: DbUser does NOT includes services, so overwriting
     * modifier.$set.services is both very easy and very bad (amongst other
     * things, it will invalidate the user's session)
     */
    modifier.$set["services.auth0"] = await getAuth0Profile(user);
  }
  return modifier;
});

getCollectionHooks("Users").editSync.add(function maybeSendVerificationEmail (modifier, user: DbUser)
{
  if(modifier.$set.whenConfirmationEmailSent
      && (!user.whenConfirmationEmailSent
          || user.whenConfirmationEmailSent.getTime() !== modifier.$set.whenConfirmationEmailSent.getTime()))
  {
    void sendVerificationEmail(user);
  }
});

getCollectionHooks("Users").updateBefore.add(async function updateProfileTagsSubscribesUser(data, {oldDocument, newDocument}: UpdateCallbackProperties<DbUser>) {
  // check if the user added any tags to their profile
  const tagIdsAdded = newDocument.profileTagIds?.filter(tagId => !includes(oldDocument.profileTagIds || [], tagId)) || []
  
  // if so, then we want to subscribe them to the newly added tags
  if (tagIdsAdded.length > 0) {
    const tagsAdded = await Tags.find({_id: {$in: tagIdsAdded}}).fetch()
    const tagsById = keyBy(tagsAdded, tag => tag._id)
    
    let newFrontpageFilterSettings: FilterSettings = newDocument.frontpageFilterSettings || getDefaultFilterSettings()
    for (let addedTag of tagIdsAdded) {
      const tagName = tagsById[addedTag].name
      const existingFilter = newFrontpageFilterSettings.tags.find(tag => tag.tagId === addedTag)
      // if the user already had a filter for this tag, see if we should update it or leave it alone
      if (existingFilter) {
        if (includes([0, 'Default', 'TagDefault'], existingFilter.filterMode)) {
          newFrontpageFilterSettings = {
            ...newFrontpageFilterSettings,
            tags: [
              ...newFrontpageFilterSettings.tags.filter(tag => tag.tagId !== addedTag),
              {tagId: addedTag, tagName: tagName, filterMode: 'Subscribed'}
            ]
          }
        }
      } else {
        // otherwise, subscribe them to this tag
        newFrontpageFilterSettings = {
          ...newFrontpageFilterSettings,
          tags: [
            ...newFrontpageFilterSettings.tags,
            {tagId: addedTag, tagName: tagName, filterMode: 'Subscribed'}
          ]
        }
      }
    }
    return {...data, frontpageFilterSettings: newFrontpageFilterSettings}
  }
  return data
})

getCollectionHooks("Users").editAsync.add(async function approveUnreviewedSubmissions (newUser: DbUser, oldUser: DbUser)
{
  if(newUser.reviewedByUserId && !oldUser.reviewedByUserId)
  {
    // For each post by this author which has the authorIsUnreviewed flag set,
    // clear the authorIsUnreviewed flag so it's visible, and update postedAt
    // to now so that it goes to the right place int he latest posts list.
    const unreviewedPosts = await Posts.find({userId:newUser._id, authorIsUnreviewed:true}).fetch();
    for (let post of unreviewedPosts) {
      await updateMutator<DbPost>({
        collection: Posts,
        documentId: post._id,
        set: {
          authorIsUnreviewed: false,
          postedAt: new Date(),
        },
        validate: false
      });
    }
    
    // Also clear the authorIsUnreviewed flag on comments. We don't want to
    // reset the postedAt for comments, since those are by default visible
    // almost everywhere. This can bypass the mutation system fine, because the
    // flag doesn't control whether they're indexed in Algolia.
    await Comments.rawUpdateMany({userId:newUser._id, authorIsUnreviewed:true}, {$set:{authorIsUnreviewed:false}}, {multi: true})
  }
});

getCollectionHooks("Users").updateAsync.add(function updateUserMayTriggerReview({document}: UpdateCallbackProperties<DbUser>) {
  void triggerReviewIfNeeded(document._id)
})

// When the very first user account is being created, add them to Sunshine
// Regiment. Patterned after a similar callback in
// vulcan-users/lib/server/callbacks.js which makes the first user an admin.
getCollectionHooks("Users").newSync.add(async function makeFirstUserAdminAndApproved (user: DbUser) {
  if (isAnyTest) return user;
  const realUsersCount = await Users.find({}).count();
  if (realUsersCount === 0) {
    user.reviewedByUserId = "firstAccount"; //HACK
    
    // Add the first user to the Sunshine Regiment
    if (!user.groups) user.groups = [];
    user.groups.push("sunshineRegiment");
  }
  return user;
});

getCollectionHooks("Users").editSync.add(function clearKarmaChangeBatchOnSettingsChange (modifier, user: DbUser)
{
  if (modifier.$set && modifier.$set.karmaChangeNotifierSettings) {
    if (!user.karmaChangeNotifierSettings.updateFrequency
      || modifier.$set.karmaChangeNotifierSettings.updateFrequency !== user.karmaChangeNotifierSettings.updateFrequency) {
      modifier.$set.karmaChangeLastOpened = null;
      modifier.$set.karmaChangeBatchStart = null;
    }
  }
});

getCollectionHooks("Users").newAsync.add(async function subscribeOnSignup (user: DbUser) {
  // Regardless of the config setting, try to confirm the user's email address
  // (But not in unit-test contexts, where this function is unavailable and sending
  // emails doesn't make sense.)
  if (!isAnyTest && forumTypeSetting.get() !== 'EAForum') {
    void sendVerificationEmail(user);
    
    if (user.emailSubscribedToCurated) {
      await bellNotifyEmailVerificationRequired(user);
    }
  }
});

// When creating a new account, populate their A/B test group key from their
// client ID, so that their A/B test groups will persist from when they were
// logged out.
getCollectionHooks("Users").newAsync.add(async function setABTestKeyOnSignup (user: DbInsertion<DbUser>) {
  if (!user.abTestKey) {
    const abTestKey = user.profile?.clientId || randomId();
    await Users.rawUpdateOne(user._id, {$set: {abTestKey: abTestKey}});
  }
});

getCollectionHooks("Users").editAsync.add(async function handleSetShortformPost (newUser: DbUser, oldUser: DbUser) {
  if (newUser.shortformFeedId !== oldUser.shortformFeedId)
  {
    const post = await Posts.findOne({_id: newUser.shortformFeedId});
    if (!post)
      throw new Error("Invalid post ID for shortform");
    if (post.userId !== newUser._id)
      throw new Error("Post can only be an author's short-form post if they are the post's author");
    if (post.draft)
      throw new Error("Draft post cannot be a user's short-form post");
    // @ts-ignore -- this should be something with post.status; post.deleted doesn't exist
    if (post.deleted)
      throw new Error("Deleted post cannot be a user's short-form post");
    
    // In theory, we should check here whether the user already had a short-form
    // post which is getting un-set, and clear the short-form flag from it. But
    // in the long run we won't need to do this, because creation of short-form
    // posts will be automatic-only, and as admins we can just not click the
    // set-as-shortform button on posts for users that already have a shortform.
    // So, don't bother checking for an old post in the shortformFeedId field.
    
    // Mark the post as shortform
    await updateMutator({
      collection: Posts,
      documentId: post._id,
      set: { shortform: true },
      unset: {},
      validate: false,
    });
  }
});


getCollectionHooks("Users").newSync.add(async function usersMakeAdmin (user: DbUser) {
  if (isAnyTest) return user;
  // if this is not a dummy account, and is the first user ever, make them an admin
  // TODO: should use await Connectors.count() instead, but cannot await inside Accounts.onCreateUser. Fix later. 
  if (typeof user.isAdmin === 'undefined') {
    const realUsersCount = await Users.find({}).count();
    user.isAdmin = (realUsersCount === 0);
  }
  return user;
});

getCollectionHooks("Users").editSync.add(async function usersEditCheckEmail (modifier, user: DbUser) {
  // if email is being modified, update user.emails too
  if (modifier.$set && modifier.$set.email) {

    const newEmail = modifier.$set.email;

    // check for existing emails and throw error if necessary
    const userWithSameEmail = await userFindByEmail(newEmail);
    if (userWithSameEmail && userWithSameEmail._id !== user._id) {
      throw new Error(encodeIntlError({id:'users.email_already_taken', value: newEmail}));
    }

    // if user.emails exists, change it too
    if (!!user.emails && user.emails.length) {
      if (user.emails[0].address !== newEmail) {
        user.emails[0].address = newEmail;
        user.emails[0].verified = false;
        modifier.$set.emails = user.emails;
      }
    } else {
      modifier.$set.emails = [{address: newEmail, verified: false}];
    }
  }
  return modifier;
});

getCollectionHooks("Users").editAsync.add(async function subscribeToForumDigest (newUser: DbUser, oldUser: DbUser) {
  if (
    isAnyTest ||
    forumTypeSetting.get() !== 'EAForum' ||
    newUser.subscribedToDigest === oldUser.subscribedToDigest
  ) {
    return;
  }

  const mailchimpAPIKey = mailchimpAPIKeySetting.get();
  const mailchimpForumDigestListId = mailchimpForumDigestListIdSetting.get();
  if (!mailchimpAPIKey || !mailchimpForumDigestListId) {
    return;
  }
  if (!newUser.email) {
    captureException(new Error(`Forum digest subscription failed: no email for user ${newUser.displayName}`))
    return;
  }
  const { lat: latitude, lng: longitude, known } = userGetLocation(newUser);
  const status = newUser.subscribedToDigest ? 'subscribed' : 'unsubscribed'; 
  
  const emailHash = md5(newUser.email.toLowerCase());

  void fetch(`https://us8.api.mailchimp.com/3.0/lists/${mailchimpForumDigestListId}/members/${emailHash}`, {
    method: 'PUT',
    body: JSON.stringify({
      email_address: newUser.email,
      email_type: 'html', 
      ...(known && {location: {
        latitude,
        longitude,
      }}),
      merge_fields: {
        FNAME: newUser.displayName,
      },
      status,
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `API_KEY ${mailchimpAPIKey}`,
    },
  }).catch(e => {
    captureException(e);
    // eslint-disable-next-line no-console
    console.log(e);
  });
});

/**
 * This callback adds all new users to an audience in Mailchimp which will be used for a forthcoming
 * (as of 2021-08-11) drip campaign.
 */
getCollectionHooks("Users").newAsync.add(async function subscribeToEAForumAudience(user: DbUser) {
  if (isAnyTest || forumTypeSetting.get() !== 'EAForum') {
    return;
  }
  const mailchimpAPIKey = mailchimpAPIKeySetting.get();
  const mailchimpEAForumListId = mailchimpEAForumListIdSetting.get();
  if (!mailchimpAPIKey || !mailchimpEAForumListId) {
    return;
  }
  if (!user.email) {
    captureException(new Error(`Subscription to EA Forum audience failed: no email for user ${user.displayName}`))
    return;
  }
  const { lat: latitude, lng: longitude, known } = userGetLocation(user);
  void fetch(`https://us8.api.mailchimp.com/3.0/lists/${mailchimpEAForumListId}/members`, {
    method: 'POST',
    body: JSON.stringify({
      email_address: user.email,
      email_type: 'html', 
      ...(known && {location: {
        latitude,
        longitude,
      }}),
      status: "subscribed",
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `API_KEY ${mailchimpAPIKey}`,
    },
  }).catch(e => {
    captureException(e);
    // eslint-disable-next-line no-console
    console.log(e);
  });
});


const welcomeMessageDelayer = new EventDebouncer<string,{}>({
  name: "welcomeMessageDelay",
  
  // Delay 60 minutes between when you create an account, and when we send the
  // welcome email. (You can still see the welcome post immediately, which on
  // LW is the same thing, if you want). The theory is that users creating new
  // accounts are often doing so because they're about to write a comment or
  // something, and derailing them with a bunch of stuff to read at that
  // particular moment could be bad.
  defaultTiming: {type: "delayed", delayMinutes: 60 },
  
  callback: (userId: string) => {
    void sendWelcomeMessageTo(userId);
  },
});

getCollectionHooks("Users").newAsync.add(async function sendWelcomingPM(user: DbUser) {
  await welcomeMessageDelayer.recordEvent({
    key: user._id,
    data: {},
  });
});

const welcomeEmailPostId = new DatabaseServerSetting<string|null>("welcomeEmailPostId", null);
const forumTeamUserId = new DatabaseServerSetting<string|null>("forumTeamUserId", null);

async function sendWelcomeMessageTo(userId: string) {
  const postId = welcomeEmailPostId.get();
  if (!postId || !postId.length) {
    // eslint-disable-next-line no-console
    console.log("Not sending welcome email, welcomeEmailPostId setting is not configured");
    return;
  }
  const welcomePost = await Posts.findOne({_id: postId});
  if (!welcomePost) {
    // eslint-disable-next-line no-console
    console.error(`Not sending welcome email, welcomeEmailPostId of ${postId} does not match any post`);
    return;
  }
  
  const user = await Users.findOne(userId);
  if (!user) throw new Error(`Could not find ${userId}`);
  
  // try to use forumTeamUserId as the sender,
  // and default to the admin account if not found
  const adminUserId = forumTeamUserId.get()
  let adminsAccount = adminUserId ? await Users.findOne({_id: adminUserId}) : null
  if (!adminsAccount) {
    adminsAccount = await getAdminTeamAccount()
  }
  
  const subjectLine = welcomePost.title;
  const welcomeMessageBody = welcomePost.contents.html;
  
  const conversationData = {
    participantIds: [user._id, adminsAccount._id],
    title: subjectLine,
  }
  const conversation = await createMutator({
    collection: Conversations,
    document: conversationData,
    currentUser: adminsAccount,
    validate: false
  });
  
  const messageDocument = {
    userId: adminsAccount._id,
    contents: {
      originalContents: {
        type: "html",
        data: welcomeMessageBody,
      }
    },
    conversationId: conversation.data._id,
    noEmail: true,
  }
  await createMutator({
    collection: Messages,
    document: messageDocument,
    currentUser: adminsAccount,
    validate: false
  })
  
  // the EA Forum has a separate "welcome email" series that is sent via mailchimp,
  // so we're not sending the email notification for this welcome PM
  if (forumTypeSetting.get() !== 'EAForum') {
    await wrapAndSendEmail({
      user,
      subject: subjectLine,
      body: <Components.EmailContentItemBody dangerouslySetInnerHTML={{ __html: welcomeMessageBody }}/>
    })
  }
}

getCollectionHooks("Users").updateBefore.add(async function UpdateDisplayName(data: DbUser, {oldDocument}) {
  if (data.displayName !== undefined && data.displayName !== oldDocument.displayName) {
    if (!data.displayName) {
      throw new Error("You must enter a display name");
    }
    if (await Users.findOne({displayName: data.displayName})) {
      throw new Error("This display name is already taken");
    }
  }
  return data;
});
