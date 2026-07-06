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
};
