<!--
Inspiration from https://github.com/atom/atom/blob/master/CONTRIBUTING.md
-->

# Contributing to TF2 Automatic

The following is a set of guidelines for contributing to TF2 Automatic. These are guidelines and not rules, use your own judgement and feel free to propose changes to this in a pull request.

## Table of Contents

[How can I contribute?](#how-to-contribute)

* [Reporting bugs](#reporting-bugs)
* [Suggesting changes](#suggesting-changes)
* [Pull requests](#pull-requests)

[Styleguides](#styleguides)

* [Git commit messages](#git-commit-messages)
* [JavaScript Styleguide](#javascript-styleguide)
* [Documentation Styleguide](#documentation-styleguide)

## How to contribute

### Reporting bugs

Please don't use GitHub issues for questions, we have a [Discord server](https://discord.tf2automatic.com) for that.

Before creating bug reports, please check [this list](#before-submitting-a-bug-report) as you might find that you don't need to create one. When creating a bug report please include as many details as possible.

* **Make sure that it an actual problem.** You might be able to find the cause of the problem and fix it yourself. Most importantly, check if you can reproduce the problem.
* **Check perviously made issues** to see if the problem has already been reported. If it has **and the issue is still open**, add a comment to the existing issue instead of opening a new one.
* **Ask for help in the [Discord server](https://discord.tf2automatic.com).** Someone might know the issue and tell you what to do to fix it.

#### How to submit a bug report

Bugs are tracked as [GitHub issues](https://guides.github.com/features/issues/). After you have determined that it is a bug, create an issue and provide following information by filling in [the template](https://github.com/Nicklason/tf2-automatic/blob/master/.github/ISSUE_TEMPLATE/bug_report.md).

#### Before submitting a bug report

Explain the problem and include additional details to help reproduce the problem:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem.**
* **Describe the behavior you observed following the steps** and point out what the problem is with the behavior.
* **Describe what you expected to see instead and why.**
* **Include screenshots and GIFs** which show you following the described steps and clearly demonstrate the problem.
* **If you're reporting that TF2 Automatic crashed** then include the crash report with a stack trace. Crash reports are saved in `/tf2-automatic/logs/<STEAM_ACCOUNT_NAME>.error.log`.

Provide more context by answering these questions:

* **What version are you running?**

### Suggesting changes

This section guides you through submitting a feature request including new features or improvements. Following the guidelines helps people to understand your suggestion.

Before suggesting changes, please check [this list](#before-submitting-a-feature-request) as you might find that you don't need to create one. When creating a feature request please include as many details as possible.

#### How to suggest changes

Just like [bug reports](#reporting-bugs), feature requests are tracked as [GitHub issues](https://guides.github.com/features/issues/). Create an issue and fill in the [the template](https://github.com/Nicklason/tf2-automatic/blob/master/.github/ISSUE_TEMPLATE/feature_request.md).

#### Before submitting a feature request

* **Check if the feature already exists.**
* **Check perviously made issues** to see if the feature was already requested. If it was **and the issue is still open**, add a comment to the existing issue instead of opening a new one.

### Pull requests

When contributing to this repository, please first discuss the change you wish to make via issue, or any other method with the owners or contributors of this repository before making a change.

All pull requests should be made to [the development branch](https://github.com/Nicklason/tf2-automatic/tree/development). When a new release is made the development branch will be merged with the master branch.

## Styleguides

### Git commit messages

* Use the present tense ("Add feature" not "Added feature")
* Keep the messages short and simple
* Reference issues and pull requests liberally after the first line
* Consider starting the commit message with [an emoji](https://gist.github.com/parmentf/035de27d6ed1dce0b36a)

### JavaScript Styleguide

All JavaScript must follow the eslint rules made.

To enable eslint, install it globally using `npm install -g pm2`. It can be used either using the command `npm run lint`, or by installing [an extention](https://eslint.org/docs/6.0.0/user-guide/integrations) to your editor.

### Documentation Styleguide

* Use [JSDoc](https://jsdoc.app/tags-example.html)
* Use [Markdown](https://guides.github.com/features/mastering-markdown/)

#### Example

```js
/**
 * Signs in to Steam and catches login error
 * @param {String} loginKey A login key used to sign in without 2FA code (can be `null`)
 * @param {Function} callback The function to call after signing in to Steam
 */
function login (loginKey, callback) {
    // ...
}
```
