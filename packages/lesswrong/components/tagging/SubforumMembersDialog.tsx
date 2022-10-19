import React from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import { useMulti } from '../../lib/crud/withMulti';
import DialogContent from '@material-ui/core/DialogContent';


const styles = (theme: ThemeType): JssStyles => ({
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 14,
    padding: '0 24px',
    [theme.breakpoints.down("sm")]: {
    },
  },
  title: {
    fontFamily: theme.typography.postStyle.fontFamily,
    fontSize: 20,
    lineHeight: '26px',
    fontWeight: 400,
    textTransform: 'capitalize'
  },
  joinBtn: {
    '& button': {
      minHeight: 0,
      fontSize: 12,
      padding: 6
    }
  },
  user: {
    marginBottom: 20
  }
})

const SubforumMembersDialog = ({classes, onClose, tag}: {
  classes: ClassesType,
  onClose: () => void,
  tag: TagBasicInfo,
}) => {
  const { results: members } = useMulti({
    terms: {view: 'tagCommunityMembers', profileTagId: tag?._id, limit: 100},
    collectionName: 'Users',
    fragmentName: 'UsersProfile',
    skip: !tag
  })
  
  const { LWDialog, SubforumSubscribeSection, SubforumMember } = Components
  
  return (
    <LWDialog open={true} onClose={onClose}>
      <h2 className={classes.titleRow}>
        <div className={classes.title}>Members{members ? ` (${members.length})` : ''}</div>
        <SubforumSubscribeSection tag={tag} className={classes.joinBtn} />
      </h2>
      <DialogContent>
        {members?.map(user => {
          return <div key={user._id} className={classes.user}>
            <SubforumMember user={user} />
          </div>
        })}
      </DialogContent>
    </LWDialog>
  )
}

const SubforumMembersDialogComponent = registerComponent('SubforumMembersDialog', SubforumMembersDialog, { styles })

declare global {
  interface ComponentTypes {
    SubforumMembersDialog: typeof SubforumMembersDialogComponent
  }
}
