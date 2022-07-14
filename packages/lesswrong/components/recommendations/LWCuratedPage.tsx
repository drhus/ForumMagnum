import React from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import {AnalyticsContext} from "../../lib/analyticsEvents";
import { forumTypeSetting } from '../../lib/instanceSettings';
import { useCurrentUser } from '../common/withUser';

const styles = (theme: ThemeType): JssStyles => ({
  curated: {
    position: "absolute",
    right: 0,
    top: 65,
    width: 210,
    [theme.breakpoints.down('md')]: {
      display: "none"
    }
  }
});

const LWCuratedPage = ({classes}: {
  classes: ClassesType
}) => {
  const { ConfigurableRecommendationsList, PostsList2, SingleColumnSection, SectionTitle, SunshineCuratedSuggestionsList } = Components;

  const currentUser = useCurrentUser()
  const showCurated = forumTypeSetting.get() === 'LessWrong'

  return (
    <div>
      <AnalyticsContext pageContext={"curatedPage"}>
        {showCurated && <SingleColumnSection>
          <AnalyticsContext pageSectionContext={"curatedPosts"} capturePostItemOnMount>
            <SectionTitle title="Curated Posts"/>
            <PostsList2
              terms={{view:"curated", limit: 12}}
              showNoResults={false}
              boxShadow={false}
              curatedIconLeft={true}
            />
          </AnalyticsContext>
        </SingleColumnSection>}
        <AnalyticsContext pageSectionContext={"archiveRecommendations"} capturePostItemOnMount>
          <ConfigurableRecommendationsList configName="recommendationspage" />
        </AnalyticsContext>
        {showCurated && currentUser?.isAdmin && <div className={classes.curated}>
          <SunshineCuratedSuggestionsList terms={{view:"sunshineCuratedSuggestions", limit: 50}} belowFold/>
        </div>}
      </AnalyticsContext>
    </div>
  )
};

const LWCuratedPageComponent = registerComponent('LWCuratedPage', LWCuratedPage, {styles});

declare global {
  interface ComponentTypes {
    LWCuratedPage: typeof LWCuratedPageComponent
  }
}

