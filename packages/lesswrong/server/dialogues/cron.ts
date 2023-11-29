import { addCronJob } from "../cronUtil";
import { createNotification } from "../notificationCallbacksHelpers";
import { createAdminContext } from "../vulcan-lib";

addCronJob({
  name: 'notifyUsersOfNewDialogueChecks',
  interval: 'every 1 hour',
  async job() {
    const context = createAdminContext();
    const usersWithNewChecks = await context.repos.users.getUsersWithNewDialogueChecks(1)
    usersWithNewChecks.forEach(user => {
      void createNotification({
        userId: user._id,
        notificationType: "newDialogueChecks",
        documentType: "newDialogueChecks",
        documentId: null,
        context,
      })
    })
  }
});
