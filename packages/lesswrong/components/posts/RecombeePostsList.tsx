import React from 'react';
import { Components, fragmentTextForQuery, registerComponent } from '../../lib/vulcan-lib';
import { NetworkStatus, gql, useQuery } from '@apollo/client';
import { HybridRecombeeConfiguration, RecombeeConfiguration } from '../../lib/collections/users/recommendationSettings';
import { useOnMountTracking } from '../../lib/analyticsEvents';
import uniq from 'lodash/uniq';
import { filterNonnull } from '../../lib/utils/typeGuardUtils';

// Would be nice not to duplicate in postResolvers.ts but unfortunately the post types are different
interface RecombeeRecommendedPost {
  post: PostsListWithVotes,
  recommId: string,
  curated?: never,
  stickied?: never,
}

type RecommendedPost = RecombeeRecommendedPost | {
  post: PostsListWithVotes,
  recommId?: never,
  curated: boolean,
  stickied: boolean,
};

const styles = (theme: ThemeType) => ({
  root: {

  }
});

const DEFAULT_RESOLVER_NAME = 'RecombeeLatestPosts';
const HYBRID_RESOLVER_NAME = 'RecombeeHybridPosts';

type RecombeeResolver = typeof DEFAULT_RESOLVER_NAME | typeof HYBRID_RESOLVER_NAME;

const getRecombeePostsQuery = (resolverName: RecombeeResolver) => gql`
  query get${resolverName}($limit: Int, $settings: JSON) {
    ${resolverName}(limit: $limit, settings: $settings) {
      results {
        post {
          ...PostsListWithVotes
        }
        recommId
        curated
        stickied
      }
    }
  }
  ${fragmentTextForQuery('PostsListWithVotes')}
`;

const getLoadMoreSettings = (resolverName: RecombeeResolver, results: RecommendedPost[]): (RecombeeConfiguration | HybridRecombeeConfiguration)['loadMore'] => {
  switch (resolverName) {
    case DEFAULT_RESOLVER_NAME:
      const prevRecommId = results.find(result => result.recommId)?.recommId;
      if (!prevRecommId) {
        return undefined;
      }
      return { prevRecommId };  
    case HYBRID_RESOLVER_NAME:
      const [firstRecommId, secondRecommId] = filterNonnull(uniq(results.map(({ recommId }) => recommId)));
      return { prevRecommIds: [firstRecommId, secondRecommId] };
  }
}

export const stickiedPostTerms: PostsViewTerms = {
  view: 'stickied',
  limit: 4, // seriously, shouldn't have more than 4 stickied posts
  forum: true
};

export const RecombeePostsList = ({ algorithm, settings, limit = 10, classes }: {
  algorithm: string,
  settings: RecombeeConfiguration,
  limit?: number,
  classes: ClassesType<typeof styles>,
}) => {
  const { Loading, LoadMore, PostsItem, SectionFooter } = Components;

  const recombeeSettings = { ...settings, scenario: algorithm };

  const resolverName = algorithm === 'recombee-hybrid'
    ? HYBRID_RESOLVER_NAME
    : DEFAULT_RESOLVER_NAME;

  const query = getRecombeePostsQuery(resolverName);
  const { data, loading, fetchMore, networkStatus } = useQuery(query, {
    ssr: true,
    notifyOnNetworkStatusChange: true,
    pollInterval: 0,
    variables: {
      limit,
      settings: recombeeSettings,
    },
  });

  const results: RecommendedPost[] | undefined = data?.[resolverName]?.results;
  const postIds = results?.map(({post}) => post._id) ?? [];

  useOnMountTracking({
    eventType: "postList",
    eventProps: { postIds },
    captureOnMount: (eventProps) => eventProps.postIds.length > 0,
    skip: !postIds.length || loading,
  });

  if (loading && !results) {
    return <Loading />;
  }

  if (!results) {
    return null;
  }

  return <div>
    <div className={classes.root}>
      {results.map(({ post, recommId, curated, stickied }) => <PostsItem 
        key={post._id} 
        post={post} 
        recombeeRecommId={recommId} 
        curatedIconLeft={curated} 
        terms={stickied ? stickiedPostTerms : undefined}
      />)}
    </div>
    <SectionFooter>
      <LoadMore
        loading={loading || networkStatus === NetworkStatus.fetchMore}
        loadMore={() => {
          const loadMoreSettings = getLoadMoreSettings(resolverName, results);
          void fetchMore({
            variables: {
              settings: { ...recombeeSettings, loadMore: loadMoreSettings },
            },
            // Update the apollo cache with the combined results of previous loads and the items returned by the current loadMore
            updateQuery: (prev: AnyBecauseHard, { fetchMoreResult }: AnyBecauseHard) => {
              if (!fetchMoreResult) return prev;

              return {
                [resolverName]: {
                  __typename: fetchMoreResult[resolverName].__typename,
                  results: [...prev[resolverName].results, ...fetchMoreResult[resolverName].results]
                }
              };
            }
          });
        }}
        sectionFooterStyles
      />
    </SectionFooter>
  </div>;
}

const RecombeePostsListComponent = registerComponent('RecombeePostsList', RecombeePostsList, {styles});

declare global {
  interface ComponentTypes {
    RecombeePostsList: typeof RecombeePostsListComponent
  }
}
