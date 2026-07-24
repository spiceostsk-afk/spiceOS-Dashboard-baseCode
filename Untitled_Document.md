# AGENTS_PROJECT_EXTENSION.md

> Add this file alongside your existing `AGENTS.md`. This file teaches the coding agent **how to work inside an existing production project**, not just how to write good code.

---

# Project First Philosophy

This repository is an active production project.

Your job is **not** to rewrite it.

Your job is to understand it, extend it, and improve it while preserving stability.

Never optimize for writing the most code.

Optimize for writing the least amount of correct code.

Every modification should leave the project in a better state than before.

---

# Mandatory Project Analysis

Before writing a single line of code, perform the following analysis.

## Step 1

Read the project structure.

Understand

* Framework
* Build system
* Routing
* State management
* API architecture
* Authentication
* Folder organization
* Database
* Shared components

---

## Step 2

Read similar implementations.

If building:

* Billing

Find existing payment modules.

If building:

* Tables

Find existing table components.

Never build from memory.

Always build from existing project patterns.

---

## Step 3

Find reusable code.

Search for

* Components
* Services
* Hooks
* Contexts
* Utilities
* Types
* Validators
* Constants

Never duplicate them.

---

## Step 4

Understand dependencies.

Determine

Which files import this feature.

Which services consume it.

Which APIs depend on it.

Which database tables change.

Which UI components use it.

---

## Step 5

Create an implementation plan.

Before coding explain

* What will change
* Why it will change
* Files affected
* Database changes
* API changes
* Possible regressions

Only after planning begin implementation.

---

# Existing Architecture Rules

Never introduce another architecture.

Never create another state management system.

Never introduce another API layer.

Never introduce another styling system.

Never introduce another validation strategy.

Never introduce another notification system.

Always extend existing architecture.

---

# Existing Code First

Always search before creating.

If a similar implementation exists

Reuse it.

If a utility already exists

Reuse it.

If a component exists

Extend it.

If an API exists

Use it.

If a hook exists

Reuse it.

Never duplicate functionality.

---

# Read Before Write

Every modified file must be completely understood.

Before editing a file

Read

* Imports
* Exports
* Related files
* Parent components
* Child components
* Similar modules

Never modify code you don't understand.

---

# Planning Before Coding

Before implementation answer

What problem am I solving?

How is it solved elsewhere?

Can I reuse existing code?

Which files change?

Which APIs change?

Which database tables change?

What could break?

How will I verify it?

Only after answering begin implementation.

---

# Feature Workflow

Every feature follows this order.

Understand.

Analyze.

Plan.

Reuse.

Implement.

Review.

Test.

Verify.

Complete.

Never skip planning.

---

# Bug Fix Workflow

Never patch symptoms.

Find the root cause.

Understand why it happened.

Fix the underlying issue.

Search for similar occurrences.

Verify no regressions.

---

# Refactoring Rules

Only refactor when

Improving readability.

Removing duplication.

Reducing complexity.

Never refactor unrelated code during feature work.

Small safe improvements are preferred.

---

# UI Consistency

Never invent a new UI pattern.

Reuse

Buttons

Cards

Dialogs

Tables

Forms

Typography

Spacing

Icons

Animations

Loading indicators

Error components

Keep the application visually consistent.

---

# API Rules

Never call APIs directly from UI unless that is already the established architecture.

Use existing service layers.

Handle

Loading

Success

Failure

Timeout

Retry

Unauthorized

Offline

Unexpected responses

---

# State Management Rules

Keep state where it belongs.

Avoid duplicate state.

Avoid unnecessary global state.

Avoid unnecessary prop drilling.

Follow the existing state management approach.

---

# Database Rules

Never duplicate data.

Never bypass existing repositories.

Never write raw queries if an abstraction already exists.

Preserve data integrity.

Think about migrations before implementation.

---

# Security Rules

Validate all inputs.

Validate permissions.

Never trust frontend authorization.

Never expose secrets.

Never log sensitive information.

Never bypass authentication.

---

# Performance Rules

Avoid unnecessary renders.

Avoid unnecessary queries.

Avoid duplicate API requests.

Avoid loading unnecessary data.

Optimize only when measurements justify it.

---

# Testing Rules

Every feature must be verified.

Check

Happy path.

Empty state.

Error state.

Loading state.

Permission denied.

Offline.

Edge cases.

Regression.

Update tests when behavior changes.

---

# Self Review

Before completion verify

✓ Project still builds

✓ No lint errors

✓ No type errors

✓ No console errors

✓ No duplicate logic

✓ No dead code

✓ Existing features still work

✓ New feature works

✓ Responsive layout

✓ Loading state

✓ Error state

✓ Empty state

✓ Permission checks

✓ No regressions

---

# Product Responsibilities

Never mix responsibilities.

Customer Panel

* Browse menu
* Place orders
* Track orders
* Call waiter

Captain Panel

* Table operations
* Customer seating
* Order management
* Restaurant floor

Admin Panel

* Billing
* Payments
* Reports
* Staff
* Menu
* Settings
* Analytics
* Business management

Never duplicate functionality across panels.

---

# Communication Rules

If requirements are unclear

Do not guess.

Explain assumptions.

Present the implementation plan.

Highlight tradeoffs.

Then implement.

---

# Definition of Done

A task is complete only if

* Requirements satisfied
* Architecture respected
* Existing patterns reused
* No regressions
* Error handling complete
* Validation complete
* Security preserved
* Tests updated
* Build successful
* Code reviewed
* Feature verified

---

# Final Principle

Think before coding.

Read before modifying.

Reuse before creating.

Review before finishing.

Quality over speed.

The goal is not to generate code.

The goal is to produce production quality software that another senior engineer can confidently maintain for years.
