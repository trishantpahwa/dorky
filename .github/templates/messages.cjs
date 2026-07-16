/**
 * Message templates for GitHub automation workflows
 * Edit these messages without touching the workflow logic
 */

module.exports = {
  // =============================================================================
  // ISSUE AUTO-RESPOND (issue-auto-respond.yml)
  // =============================================================================
  issueAutoRespond: {
    alreadyAssigned: {
      greeting: 'Hey @{commenter}! 👋',
      body: 'Thanks for your interest! Unfortunately, this issue is already assigned to @{assignee}.',
      suggestion:
        'Keep an eye on our [issues list]({repoUrl}/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22) for other contribution opportunities!',
      encouragement: 'Thanks for wanting to contribute to dorky! 💪',
    },
    assigned: {
      greeting: 'Hey @{commenter}! 👋',
      body: "Thanks for claiming this issue! You've been assigned. 🎉",
      deadline:
        "⏰ **Heads up:** you have **24 hours** from now to complete this issue (PR opened and merged). If it isn't done in time, you'll be automatically unassigned, any open PR you have for it will be closed, and the issue will be reopened for someone else to claim.",
      nextSteps: {
        title: '**Next steps:**',
        items: [
          'Star our repo ⭐',
          'Fork our repo 🍴',
          'Make the changes described above',
          'Submit a Pull Request linking to this issue (use `Closes #{issueNumber}`)',
          'Wait for review!',
        ],
      },
      resources: {
        title: '**Helpful resources:**',
        items: [
          '[README]({repoUrl}#readme)',
          '[Open issues]({repoUrl}/issues)',
        ],
      },
      footer: "Need help? Just comment here and we'll assist you!",
      encouragement: 'Happy hacking! 🍀',
    },
  },

  // =============================================================================
  // ISSUE UNASSIGN STALE (issue-unassign-stale.yml)
  // =============================================================================
  issueUnassignStale: {
    body:
      'This issue was assigned to @{assignee} more than 24 hours ago and the work was not completed in time, so they have been automatically unassigned.',
    prClosedNote: 'Their open pull request(s) linked to this issue ({prList}) have also been closed.',
    footer: "This issue is up for grabs again — comment below if you'd like to claim it! 🙌",
  },

  // =============================================================================
  // WELCOME (welcome.yml)
  // =============================================================================
  welcome: {
    firstIssue: {
      greeting: 'Welcome to the dorky community, @{commenter}! 🎉',
      body: "Thank you for opening your first issue here! We're excited to have you.",
      nextSteps:
        'A maintainer will look into this soon. In the meantime, please make sure you have provided all the details requested in the template.',
      encouragement: 'Thanks for helping make dorky better! 🚀',
    },
    firstPR: {
      greeting: "Amazing work, @{commenter}! You've just opened your first Pull Request! 🏆",
      body: "We really appreciate the time and effort you've put into this contribution.",
      nextSteps:
        "Our team will review your PR as soon as possible. Please ensure all tests are passing and you've linked the related issue.",
      encouragement: "You're awesome! 🙌",
    },
  },
};
