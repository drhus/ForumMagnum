import React from 'react';
import { Components, registerComponent, getFragment } from 'meteor/vulcan:core';
import { useSingle } from '../../lib/crud/withSingle';
import { useMessages } from '../common/withMessages';
import { Posts } from '../../lib/collections/posts';
import { useLocation, useNavigation } from '../../lib/routeUtil'
import { createStyles } from '@material-ui/core/styles';
import NoSsr from '@material-ui/core/NoSsr';

const styles = createStyles(theme => ({
  formSubmit: {
    display: "flex",
    flexWrap: "wrap",
  }
}))

const PostsEditForm = ({
  documentId, eventForm, classes,
}) => {
  const { location } = useLocation();
  const { history } = useNavigation();
  const { flash } = useMessages();
  const { document } = useSingle({
    documentId,
    collection: Posts,
    fragmentName: 'PostsPage',
  });
  const { params } = location; // From withLocation
  const isDraft = document && document.draft;
  const { WrappedSmartForm, PostSubmit, SubmitToFrontpageCheckbox } = Components
  const EditPostsSubmit = (props) => {
    return <div className={classes.formSubmit}>
      {!eventForm && <SubmitToFrontpageCheckbox {...props} />}
      <PostSubmit
        saveDraftLabel={isDraft ? "Save as draft" : "Move to Drafts"}
        {...props}
      />
    </div>
  }

  return (
    <div className="posts-edit-form">
      <NoSsr>
        <WrappedSmartForm
          collection={Posts}
          documentId={documentId}
          queryFragment={getFragment('PostsEdit')}
          mutationFragment={getFragment('PostsEdit')}
          successCallback={post => {
            flash({ id: 'posts.edit_success', properties: { title: post.title }, type: 'success'});
            history.push({pathname: Posts.getPageUrl(post)});
          }}
          eventForm={eventForm}
          removeSuccessCallback={({ documentId, documentTitle }) => {
            // post edit form is being included from a single post, redirect to index
            // note: this.props.params is in the worst case an empty obj (from react-router)
            if (params._id) {
              history.push('/');
            }

            flash({ id: 'posts.delete_success', properties: { title: documentTitle }, type: 'success'});
            // todo: handle events in collection callbacks
            // this.context.events.track("post deleted", {_id: documentId});
          }}
          showRemove={true}
          submitLabel={isDraft ? "Publish" : "Publish Changes"}
          formComponents={{FormSubmit:EditPostsSubmit}}
          extraVariables={{
            version: 'String'
          }}
          repeatErrors
        />
      </NoSsr>
    </div>
  );
}

const PostsEditFormComponent = registerComponent('PostsEditForm', PostsEditForm, {styles});

declare global {
  interface ComponentTypes {
    PostsEditForm: typeof PostsEditFormComponent
  }
}

