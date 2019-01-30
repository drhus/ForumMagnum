import { Posts } from './collection';
import ReactDOMServer from 'react-dom/server';
import { Components, getSetting } from 'meteor/vulcan:core';
import React from 'react';
import Users from "meteor/vulcan:users";
import { makeEditable } from '../../editor/make_editable.js'
import { generateIdResolverSingle, generateIdResolverMulti } from '../../modules/utils/schemaUtils'
import { localGroupTypeFormOptions } from '../localgroups/groupTypes';
import { Utils } from 'meteor/vulcan:core';
import GraphQLJSON from 'graphql-type-json';
import { Comments } from '../comments'
import { questionAnswersSort } from '../comments/views';
import { schemaDefaultValue } from '../../collectionUtils';

export const formGroups = {
  adminOptions: {
    name: "adminOptions",
    order: 25,
    label: "Admin Options",
    startCollapsed: true,
  },
  event: {
    name: "event details",
    order: 21,
    label: "Event Details"
  },
  moderationGroup: {
    order: 60,
    name: "moderation",
    label: "Moderation Guidelines",
    helpText: "We prefill these moderation guidelines based on your user settings. But you can adjust them for each post.",
    startCollapsed: true,
  },
  options: {
    order:10,
    name: "options",
    defaultStyle: true,
    flexStyle: true
  },
  content: {
    order:20,
    name: "Content",
    defaultStyle: true,
  },
  canonicalSequence: {
    order:30,
    name: "canonicalSequence",
    label: "Canonical Sequence",
    startCollapsed: true,
  },
  advancedOptions: {
    order:40,
    name: "advancedOptions",
    label: "Options",
    startCollapsed: true,
    flexStyle: true
  },
};


const userHasModerationGuidelines = (currentUser) => {
  return !!(currentUser && ((currentUser.moderationGuidelines && currentUser.moderationGuidelines.html) || currentUser.moderationStyle))
}

Posts.addField([
  /**
    URL (Overwriting original schema)
  */
  {
    fieldName: "url",
    fieldSchema: {
      order: 12,
      control: 'EditUrl',
      placeholder: 'Add a linkpost URL',
      group: formGroups.options,
      editableBy: [Users.owns, 'sunshineRegiment', 'admins']
    }
  },
  /**
    Title (Overwriting original schema)
  */
  {
    fieldName: "title",
    fieldSchema: {
      order: 10,
      placeholder: "Title",
      control: 'EditTitle',
      editableBy: [Users.owns, 'sunshineRegiment', 'admins']
    },
  },

  /**
    Legacy: Boolean used to indicate that post was imported from old LW database
  */
  {
    fieldName: 'legacy',
    fieldSchema: {
      type: Boolean,
      optional: true,
      hidden: false,
      defaultValue: false,
      viewableBy: ['guests'],
      editableBy: ['admin'],
      insertableBy: ['admin'],
      control: "checkbox",
      order: 12,
      group: formGroups.adminOptions,
    }
  },

  /**
    Legacy ID: ID used in the original LessWrong database
  */
  {
    fieldName: 'legacyId',
    fieldSchema: {
      type: String,
      optional: true,
      hidden: true,
      viewableBy: ['guests'],
      editableBy: ['members'],
      insertableBy: ['members'],
    }
  },

  /**
    Legacy Spam: True if the original post in the legacy LW database had this post
    marked as spam
  */
  {
    fieldName: 'legacySpam',
    fieldSchema: {
      type: Boolean,
      optional: true,
      defaultValue: false,
      hidden: true,
      viewableBy: ['guests'],
      editableBy: ['members'],
      insertableBy: ['members'],
    }
  },

  /**
    Feed Id: If this post was automatically generated by an integrated RSS feed
    then this field will have the ID of the relevant feed
  */
  {
    fieldName: 'feedId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins'],
      insertableBy: ['admins'],
      resolveAs: {
        fieldName: 'feed',
        type: 'RSSFeed',
        resolver: generateIdResolverSingle(
          {collectionName: 'RSSFeeds', fieldName: 'feedId'}
        ),
        addOriginalField: true,
      },
      group: formGroups.adminOptions,
    }
  },

  /**
    Feed Link: If this post was automatically generated by an integrated RSS feed
    then this field will have the link to the original blogpost it was posted from
  */
  {
    fieldName: 'feedLink',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins'],
      insertableBy: ['admins'],
      group: formGroups.adminOptions
    }
  },

  /**
    legacyData: A complete dump of all the legacy data we have on this post in a
    single blackbox object. Never queried on the client, but useful for a lot
    of backend functionality, and simplifies the data import from the legacy
    LessWrong database
  */

  {
    fieldName: 'legacyData',
    fieldSchema: {
      type: Object,
      optional: true,
      viewableBy: ['admins'],
      insertableBy: ['admins'],
      editableBy: ['admins'],
      hidden: true,
      blackbox: true,
    }
  },

  /**
    lastVisitDateDefault: Sets the default of what the lastVisit of a post should be, resolves to the date of the last visit of a user, when a user is loggedn in. Returns null when no user is logged in;
  */

  {
    fieldName: 'lastVisitedAtDefault',
    fieldSchema: {
      type: Date,
      optional: true,
      hidden: true,
      viewableBy: ['guests'],
      resolveAs: {
        fieldName: 'lastVisitedAt',
        type: 'Date',
        resolver: async (post, args, { LWEvents, currentUser }) => {
          if(currentUser){
            const event = await LWEvents.findOne({name:'post-view', documentId: post._id, userId: currentUser._id}, {sort:{createdAt:-1}});
            return event && event.createdAt
          } else {
            return post.lastVisitDateDefault
          }
        }
      }
    }
  },

  {
    fieldName: 'lastCommentedAt',
    fieldSchema: {
      type: Date,
      optional: true,
      hidden: true,
      viewableBy: ['guests'],
      onInsert: () => {
        return new Date();
      }
    }
  },

  /**
    curatedDate: Date at which the post was promoted to curated (null or false if it never has been promoted to curated)
  */

  {
    fieldName: 'curatedDate',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      insertableBy: ['sunshineRegiment', 'admins'],
      editableBy: ['sunshineRegiment', 'admins'],
      group: formGroups.adminOptions,
    }
  },
  /**
    metaDate: Date at which the post was marked as meta (null or false if it never has been marked as meta)
  */

  {
    fieldName: 'metaDate',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      insertableBy: ['sunshineRegiment', 'admins'],
      editableBy: ['sunshineRegiment', 'admins'],
      group: formGroups.adminOptions,
    }
  },
  {
    fieldName: 'suggestForCuratedUserIds',
    fieldSchema: {
      type: Array,
      viewableBy: ['members'],
      insertableBy: ['sunshineRegiment', 'admins'],
      editableBy: ['sunshineRegiment', 'admins'],
      optional: true,
      label: "Suggested for Curated by",
      control: "UsersListEditor",
      group: formGroups.adminOptions,
      resolveAs: {
        fieldName: 'suggestForCuratedUsernames',
        type: 'String',
        resolver: (post, args, context) => {
          // TODO - Turn this into a proper resolve field.
          // Ran into weird issue trying to get this to be a proper "users"
          // resolve field. Wasn't sure it actually needed to be anyway,
          // did a hacky thing.
          const users = _.map(post.suggestForCuratedUserIds,
            (userId => {
              return context.Users.findOne({ _id: userId }).displayName
            })
          )
          if (users.length) {
            return users.join(", ")
          } else {
            return null
          }
        },
        addOriginalField: true,
      }
    }
  },
  {
    fieldName: 'suggestForCuratedUserIds.$',
    fieldSchema: {
      type: String,
      optional: true
    }
  },

  /**
    frontpageDate: Date at which the post was promoted to frontpage (null or false if it never has been promoted to frontpage)
  */

  {
    fieldName: 'frontpageDate',
    fieldSchema: {
      type: Date,
      viewableBy: ['guests'],
      editableBy: ['members'],
      insertableBy: ['members'],
      optional: true,
      hidden: true,
    }
  },

  /**
    algoliaIndexAt: The last time at which the post has been indexed in Algolia's search Index.
    Undefined if it is has not been indexed.
  */

  {
    fieldName: 'algoliaIndexAt',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
    }
  },

  {
    fieldName: 'collectionTitle',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      group: formGroups.canonicalSequence,
    }
  },

  {
    fieldName: 'userId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins'],
      insertableBy: ['admins'],
      hidden: false,
      control: "text",
      group: formGroups.adminOptions,
      resolveAs: {
        fieldName: 'user',
        type: 'User',
        resolver: generateIdResolverSingle(
          {collectionName: 'Users', fieldName: 'userId'}
        ),
        addOriginalField: true
      },
    }
  },

  {
    fieldName: 'coauthorUserIds',
    fieldSchema: {
      type: Array,
      viewableBy: ['guests'],
      editableBy: ['sunshineRegiment', 'admins'],
      insertableBy: ['sunshineRegiment', 'admins'],
      optional: true,
      label: "Co-Authors",
      control: "UsersListEditor",
      group: formGroups.advancedOptions,
      resolveAs: {
        fieldName: 'coauthors',
        type: '[User]',
        resolver: generateIdResolverMulti(
          {collectionName: 'Users', fieldName: 'coauthorUserIds'}
        ),
        addOriginalField: true
      },
    }
  },
  {
    fieldName: 'coauthorUserIds.$',
    fieldSchema: {
      type: String,
      optional: true
    }
  },

  {
    fieldName: 'canonicalSequenceId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      group: formGroups.canonicalSequence,
      resolveAs: {
        fieldName: 'canonicalSequence',
        addOriginalField: true,
        type: "Sequence",
        resolver: generateIdResolverSingle(
          {collectionName: 'Sequences', fieldName: 'canonicalSequenceId'}
        ),
      },
      hidden: false,
      control: "text"
    }
  },

  {
    fieldName: 'canonicalCollectionSlug',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      hidden: false,
      control: "text",
      group: formGroups.canonicalSequence,
      resolveAs: {
        fieldName: 'canonicalCollection',
        addOriginalField: true,
        type: "Collection",
        // TODO: Make sure we run proper access checks on this. Using slugs means it doesn't
        // work out of the box with the id-resolver generators
        resolver: (post, args, context) => {
          if (!post.canonicalCollectionSlug) return null;
          return context.Collections.findOne({slug: post.canonicalCollectionSlug})
        }
      }
    }
  },

  {
    fieldName: 'canonicalBookId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      group: formGroups.canonicalSequence,
      hidden: false,
      control: "text",
      resolveAs: {
        fieldName: 'canonicalBook',
        addOriginalField: true,
        type: "Book",
        resolver: generateIdResolverSingle(
          {collectionName: 'Books', fieldName: 'canonicalBookId'}
        ),
      }
    }
  },

  {
    fieldName: 'canonicalNextPostSlug',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      group: formGroups.canonicalSequence,
      hidden: false,
      control: "text"
    }
  },

  {
    fieldName: 'canonicalPrevPostSlug',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      group: formGroups.canonicalSequence,
      hidden: false,
      control: "text"
    }
  },

  /**
    unlisted: If true, the post is not featured on the frontpage and is not featured on the user page. Only accessible via it's ID
  */

  {
    fieldName: 'unlisted',
    fieldSchema: {
      type: Boolean,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins', 'sunshineRegiment'],
      insertableBy: ['admins', 'sunshineRegiment'],
      label: "Make only accessible via link",
      control: "checkbox",
      order: 11,
      group: formGroups.adminOptions,
      ...schemaDefaultValue(false),
    }
  },



  /**
    Drafts
  */
  {
    fieldName: "draft",
    fieldSchema: {
      label: 'Save to Drafts',
      type: Boolean,
      optional: true,
      ...schemaDefaultValue(false),
      viewableBy: ['members'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      hidden: true,
    }
  },


  /**
    meta: The post is published to the meta section of the page
  */

  {
    fieldName: 'meta',
    fieldSchema: {
      type: Boolean,
      optional: true,
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: ['members'],
      hidden: true,
      label: "Publish to meta",
      control: "checkbox",
      ...schemaDefaultValue(false)
    }
  },

  {
    fieldName: 'hideFrontpageComments',
    fieldSchema: {
      type: Boolean,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['admins'],
      insertableBy: ['admins'],
      control: 'checkbox',
      group: formGroups.moderationGroup,
      ...schemaDefaultValue(false),
    }
  },

  /**
    maxBaseScore: Highest baseScore this post ever had, used for RSS feed generation
  */

  {
    fieldName: 'maxBaseScore',
    fieldSchema: {
      type: Number,
      optional: true,
      viewableBy: ['guests'],
      hidden: true,
      onInsert: (document) => document.baseScore || 0,
    }
  },
  /**
    The timestamp when the post's maxBaseScore first exceeded 2
  */
  {
    fieldName: 'scoreExceeded2Date',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      onInsert: document => document.baseScore >= 2 && new Date()
    }
  },
  /**
    The timestamp when the post's maxBaseScore first exceeded 30
  */
  {
    fieldName: 'scoreExceeded30Date',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      onInsert: document => document.baseScore >= 30 && new Date()
    }
  },
  /**
    The timestamp when the post's maxBaseScore first exceeded 45
  */
  {
    fieldName: 'scoreExceeded45Date',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      onInsert: document => document.baseScore >= 45 && new Date()
    }
  },
  /**
    The timestamp when the post's maxBaseScore first exceeded 75
  */
  {
    fieldName: 'scoreExceeded75Date',
    fieldSchema: {
      type: Date,
      optional: true,
      viewableBy: ['guests'],
      onInsert: document => document.baseScore >= 75 && new Date()
    }
  },
  {
    fieldName: 'bannedUserIds',
    fieldSchema: {
      type: Array,
      viewableBy: ['guests'],
      group: formGroups.moderationGroup,
      insertableBy: (currentUser, document) => Users.canModeratePost(currentUser, document),
      editableBy: (currentUser, document) => Users.canModeratePost(currentUser, document),
      optional: true,
      label: "Users banned from commenting on this post",
      control: "UsersListEditor",
    }
  },
  {
    fieldName: 'bannedUserIds.$',
    fieldSchema: {
      type: String,
      optional: true
    }
  },
  {
    fieldName: 'commentsLocked',
    fieldSchema: {
      type: Boolean,
      viewableBy: ['guests'],
      group: formGroups.moderationGroup,
      insertableBy: (currentUser, document) => Users.canCommentLock(currentUser, document),
      editableBy: (currentUser, document) => Users.canCommentLock(currentUser, document),
      optional: true,
      control: "checkbox",
    }
  },

  /*
    Event specific fields:
  */

  {
    fieldName: 'organizerIds',
    fieldSchema: {
      type: Array,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      optional: true,
      hidden: true,
      control: "UsersListEditor",
      resolveAs: {
        fieldName: 'organizers',
        type: '[User]',
        resolver: generateIdResolverMulti(
          {collectionName: 'Users', fieldName: 'organizerIds'}
        ),
        addOriginalField: true
      },
      group: formGroups.event,
    }
  },

  {
    fieldName: 'organizerIds.$',
    fieldSchema: {
      type: String,
      optional: true,
    }
  },

  {
    fieldName: 'groupId',
    fieldSchema: {
      type: String,
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: ['members'],
      optional: true,
      hidden: true,
      group: formGroups.event,
      resolveAs: {
        fieldName: 'group',
        type: ['Localgroup'],
        resolver: generateIdResolverSingle(
          {collectionName: 'Localgroups', fieldName: 'groupId'}
        ),
        addOriginalField: true,
      }
    }
  },

  {
    fieldName: 'isEvent',
    fieldSchema: {
      type: Boolean,
      hidden: true,
      group: formGroups.event,
      viewableBy: ['guests'],
      editableBy: ['sunshineRegiment'],
      insertableBy: ['members'],
      optional: true,
      ...schemaDefaultValue(false),
    }
  },

  {
    fieldName: 'reviewedByUserId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['sunshineRegiment', 'admins'],
      insertableBy: ['sunshineRegiment', 'admins'],
      hidden: true,
      resolveAs: {
        fieldName: 'reviewedByUser',
        type: 'User',
        resolver: generateIdResolverSingle(
          {collectionName: 'Users', fieldName: 'reviewedByUserId'}
        ),
        addOriginalField: true
      },
    }
  },

  {
    fieldName: 'reviewForCuratedUserId',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
      editableBy: ['sunshineRegiment', 'admins'],
      insertableBy: ['sunshineRegiment', 'admins'],
      group: formGroups.adminOptions,
      label: "Curated Review UserId"
    }
  },

  {
    fieldName: 'startTime',
    fieldSchema: {
      type: Date,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: ['members'],
      control: 'datetime',
      label: "Start Time",
      group: formGroups.event,
      optional: true,
    }
  },

  {
    fieldName: 'endTime',
    fieldSchema: {
      type: Date,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: ['members'],
      control: 'datetime',
      label: "End Time",
      group: formGroups.event,
      optional: true,
    }
  },

  {
    fieldName: 'mongoLocation',
    fieldSchema: {
      type: Object,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      hidden: true,
      blackbox: true,
      optional: true
    }
  },

  {
    fieldName: 'googleLocation',
    fieldSchema: {
      type: Object,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      label: "Group Location",
      control: 'LocationFormComponent',
      blackbox: true,
      group: formGroups.event,
      optional: true
    }
  },

  {
    fieldName: 'location',
    fieldSchema: {
      type: String,
      searchable: true,
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: ['members'],
      hidden: true,
      optional: true
    }
  },

  {
    fieldName: 'contactInfo',
    fieldSchema: {
      type: String,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: ['members'],
      label: "Contact Info",
      control: "MuiInput",
      optional: true,
      group: formGroups.event,
    }
  },

  {
    fieldName: 'facebookLink',
    fieldSchema: {
      type: String,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      label: "Facebook Event",
      control: "MuiInput",
      optional: true,
      group: formGroups.event,
    }
  },

  {
    fieldName: 'website',
    fieldSchema: {
      type: String,
      hidden: (props) => !props.eventForm,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      control: "MuiInput",
      optional: true,
      group: formGroups.event,
    }
  },

  {
    fieldName: 'types',
    fieldSchema: {
      type: Array,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      hidden: (props) => !props.eventForm,
      control: 'MultiSelectButtons',
      label: "Group Type:",
      group: formGroups.event,
      optional: true,
      form: {
        options: localGroupTypeFormOptions
      },
    }
  },

  {
    fieldName: 'types.$',
    fieldSchema: {
      type: String,
      optional: true,
    }
  },

  {
    fieldName: 'metaSticky',
    fieldSchema: {
      order:10,
      type: Boolean,
      optional: true,
      label: "Sticky (Meta)",
      ...schemaDefaultValue(false),
      group: formGroups.adminOptions,
      viewableBy: ['guests'],
      editableBy: ['admins'],
      insertableBy: ['admins'],
      control: 'checkbox',
      onInsert: (post) => {
        if(!post.metaSticky) {
          return false;
        }
      },
      onEdit: (modifier, post) => {
        if (!modifier.$set.metaSticky) {
          return false;
        }
      }
    }
  },

  {
    fieldName: 'sticky',
    fieldSchema: {
      order:10,
      group: formGroups.adminOptions
    }
  },

  {
    fieldName: 'postedAt',
    fieldSchema: {
      group: formGroups.adminOptions
    }
  },

  {
    fieldName: 'status',
    fieldSchema: {
      group: formGroups.adminOptions,
    }
  },

  {
    fieldName: 'shareWithUsers',
    fieldSchema: {
      type: Array,
      order: 15,
      viewableBy: ['guests'],
      insertableBy: ['members'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      optional: true,
      control: "UsersListEditor",
      label: "Share draft with users",
      group: formGroups.options
    }
  },

  {
    fieldName: 'shareWithUsers.$',
    fieldSchema: {
      type: String,
      optional: true
    }
  },

  {
    fieldName: 'commentSortOrder',
    fieldSchema: {
      type: String,
      viewableBy: ['guests'],
      insertableBy: ['admins'],
      editableBy: ['admins'],
      optional: true,
      group: formGroups.adminOptions,
    }
  },

  /*
    hideAuthor: Post stays online, but doesn't show on your user profile anymore, and doesn't
    link back to your account
  */

  {
    fieldName: 'hideAuthor',
    fieldSchema: {
      type: Boolean,
      viewableBy: ['guests'],
      insertableBy: ['admins'],
      editableBy: ['admins'],
      optional: true,
      group: formGroups.adminOptions,
      ...schemaDefaultValue(false),
    }
  },

  {
    fieldName: 'tableOfContents',
    fieldSchema: {
      type: Object,
      optional: true,
      viewableBy: ['guests'],
      resolveAs: {
        fieldName: "tableOfContents",
        type: GraphQLJSON,
        resolver: async (document, args, options) => {
          const { html } = document.content || {}
          let tocData
          if (document.question) {

            const answers = await Comments.find(
              {answer:true, postId: document._id, deleted:false},
              {sort:questionAnswersSort}
            ).fetch()

            if (answers && answers.length) {
              tocData = Utils.extractTableOfContents(html, true) || {
                html: null,
                headingsCount: 0,
                sections: []
              }

              const answerSections = answers.map((answer) => ({
                title: answer.author + "'s answer",
                anchor: answer._id,
                level: 2
              }))
              tocData = {
                html: tocData.html,
                headingsCount: tocData.headingsCount,
                sections: [
                  ...tocData.sections,
                  {anchor:"answers", level:1, title:"Answers"},
                  ...answerSections
                ]
              }
            }
          } else {
            tocData = Utils.extractTableOfContents(html)
          }
          if (tocData) {
            const selector = {
              answer:false,
              parentAnswerId:{$in:[undefined,null]},
              postId: document._id
            }
            if (document.af && getSetting('AlignmentForum', false)) {
              selector.af = true
            }
            const commentCount = await Comments.find(selector).count()
            tocData.sections.push({anchor:"comments", level:0, title:Posts.getCommentCountStr(document, commentCount)})
          }
          return tocData;
        },
      },
    }
  },

  /**
    GraphQL only field that resolves based on whether the current user has closed
    this posts author's moderation guidelines in the past
  */
  {
    fieldName: 'showModerationGuidelines',
    fieldSchema: {
      type: Boolean,
      optional: true,
      canRead: ['guests'],
      resolveAs: {
        type: 'Boolean',
        resolver: async (post, args, { LWEvents, currentUser }) => {
          if(currentUser){
            const query = {
              name:'toggled-user-moderation-guidelines',
              documentId: post.userId,
              userId: currentUser._id
            }
            const sort = {sort:{createdAt:-1}}
            const event = await LWEvents.findOne(query, sort);
            const author = await Users.findOne({_id: post.userId});
            if (event) {
              return event && event.properties && event.properties.targetState
            } else {
              return author.collapseModerationGuidelines ? false : ((post.moderationGuidelines && post.moderationGuidelines.html) || post.moderationStyle)
            }
          } else {
            return false
          }
        },
        addOriginalField: false
      }
    }
  },

  {
    fieldName: 'moderationStyle',
    fieldSchema: {
      type: String,
      optional: true,
      control: "select",
      group: formGroups.moderationGroup,
      label: "Style",
      viewableBy: ['guests'],
      editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
      insertableBy: [userHasModerationGuidelines],
      blackbox: true,
      order: 55,
      form: {
        options: function () { // options for the select form control
          return [
            {value: "", label: "No Moderation"},
            {value: "easy-going", label: "Easy Going - I just delete obvious spam and trolling."},
            {value: "norm-enforcing", label: "Norm Enforcing - I try to enforce particular rules (see below)"},
            {value: "reign-of-terror", label: "Reign of Terror - I delete anything I judge to be annoying or counterproductive"},
          ];
        }
      },
    }
  },
]);

export const makeEditableOptions = {
  formGroup: formGroups.content,
  adminFormGroup: formGroups.adminOptions,
  order: 25
}

makeEditable({
  collection: Posts,
  options: makeEditableOptions
})

export const makeEditableOptionsModeration = {
  // Determines whether to use the comment editor configuration (e.g. Toolbars)
  commentEditor: true,
  // Determines whether to use the comment editor styles (e.g. Fonts)
  commentStyles: true,
  formGroup: formGroups.moderationGroup,
  adminFormGroup: formGroups.adminOptions,
  order: 50,
  fieldName: "moderationGuidelines",
  permissions: {
    viewableBy: ['guests'],
    editableBy: [Users.owns, 'sunshineRegiment', 'admins'],
    insertableBy: [userHasModerationGuidelines]
  },
}

makeEditable({
  collection: Posts,
  options: makeEditableOptionsModeration
})


/*

Custom fields on Users collection

*/

Users.addField([
  /**
    Count of the user's posts
  */
  {
    fieldName: 'postCount',
    fieldSchema: {
      type: Number,
      optional: true,
      defaultValue: 0,
      viewableBy: ['guests'],
    }
  },
  /**
    The user's associated posts (GraphQL only)
  */
  {
    fieldName: 'posts',
    fieldSchema: {
      type: Object,
      optional: true,
      viewableBy: ['guests'],
      resolveAs: {
        arguments: 'limit: Int = 5',
        type: '[Post]',
        resolver: (user, { limit }, { currentUser, Users, Posts }) => {
          const posts = Posts.find({ userId: user._id }, { limit }).fetch();

          // restrict documents fields
          const viewablePosts = _.filter(posts, post => Posts.checkAccess(currentUser, post));
          const restrictedPosts = Users.restrictViewableFields(currentUser, Posts, viewablePosts);
          return restrictedPosts
        }
      }
    }
  },
  /**
    User's bio (Markdown version)
  */
  {
    fieldName: 'bio',
    fieldSchema: {
      type: String,
      optional: true,
      control: "textarea",
      insertableBy: ['members'],
      editableBy: ['members'],
      viewableBy: ['guests'],
      order: 30,
      searchable: true,
    }
  },
  /**
    User's bio (Markdown version)
  */
  {
    fieldName: 'htmlBio',
    fieldSchema: {
      type: String,
      optional: true,
      viewableBy: ['guests'],
    }
  },
  /**
    A link to the user's homepage
  */
  {
    fieldName: 'website',
    fieldSchema: {
      type: String,
      optional: true,
      control: "text",
      insertableBy: ['members'],
      editableBy: ['members'],
      viewableBy: ['guests'],
      order: 50,
    }
  },
]);
