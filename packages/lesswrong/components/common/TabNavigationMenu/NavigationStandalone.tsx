import React from 'react';
import { registerComponent, Components } from '../../../lib/vulcan-lib';
import Slide from '@material-ui/core/Slide'
import { useLocation } from '../../../lib/routeUtil';
import classNames from 'classnames';
import { TAB_NAVIGATION_MENU_WIDTH } from './TabNavigationMenu';
import { communityPath } from '../../../lib/routes';

const styles = (theme: ThemeType): JssStyles => ({
  sidebar: {
    width: TAB_NAVIGATION_MENU_WIDTH,
    paddingTop: 15,
    [theme.breakpoints.down('md')]: {
      display: "none"
    },
  },
  navSidebarTransparent: {
    zIndex: 10,
    background: `${theme.palette.background.default}cf`,
    backdropFilter: 'blur(6px)'
  },
  footerBar: {
    [theme.breakpoints.up('lg')]: {
      display: "none"
    },
    position: "fixed",
    bottom: 0,
    left: 0,
    backgroundColor: theme.palette.grey[300],
    width: "100%",
    zIndex: theme.zIndexes.footerNav
  },
  "@media print": {
    display: "none"
  },
  background: {
    background: theme.palette.panelBackground.translucent3,
  }
})

const NavigationStandalone = (
  {sidebarHidden, unspacedGridLayout, className, classes}:
  {sidebarHidden: boolean, unspacedGridLayout?: boolean, className: string, classes: ClassesType}
) => {
  const { TabNavigationMenu, TabNavigationMenuFooter } = Components
  const { location } = useLocation();

  const background = location.pathname === communityPath;

  return <>
    <div className={classNames(classes.sidebar, className, {[classes.background]: background, [classes.navSidebarTransparent]: unspacedGridLayout})}>
      <Slide
        direction='right'
        in={!sidebarHidden}
        appear={false}
        mountOnEnter
        unmountOnExit
      >
        <TabNavigationMenu />
      </Slide>
    </div>
    <div className={classNames(classes.footerBar, className)}>
      <TabNavigationMenuFooter />
    </div>
  </>
}

const NavigationStandaloneComponent = registerComponent(
  'NavigationStandalone', NavigationStandalone, {styles}
);

declare global {
  interface ComponentTypes {
    NavigationStandalone: typeof NavigationStandaloneComponent
  }
}
