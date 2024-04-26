import React, { useCallback } from "react";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { isPostsListViewType, usePostsListView } from "../hooks/usePostsListView";
import { useTracking } from "../../lib/analyticsEvents";

const styles = (_theme: ThemeType) => ({
  root: {
  },
});

const options = {
  card: {label: "Card view", icon: "CardView"},
  list: {label: "List view", icon: "ListView"},
} as const;

const PostsListViewToggle = ({classes}: {
  classes: ClassesType<typeof styles>,
}) => {
  const {captureEvent} = useTracking();
  const {view, setView} = usePostsListView();

  const onSelect = useCallback((value: string) => {
    if (isPostsListViewType(value)) {
      setView(value);
      captureEvent("postsListViewToggle", {value});
    }
  }, [setView, captureEvent]);

  const {ForumDropdown} = Components;
  return (
    <ForumDropdown
      value={view}
      options={options}
      onSelect={onSelect}
      paddingSize={24}
      useIconLabel
      className={classes.root}
    />
  );
}

const PostsListViewToggleComponent = registerComponent(
  "PostsListViewToggle",
  PostsListViewToggle,
  {styles},
);

declare global {
  interface ComponentTypes {
    PostsListViewToggle: typeof PostsListViewToggleComponent
  }
}
