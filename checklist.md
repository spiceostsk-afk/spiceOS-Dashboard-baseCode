# TableOS Admin Panel Audit Checklist

## Instructions for Coding Agent

Before implementing any feature, scan the entire Admin Panel project and compare it with this checklist.

For every feature mark exactly one status.

* ✅ Implemented
* 🟡 Partially Implemented
* ❌ Missing
* ⚠️ UI Exists but Backend Missing
* ⚠️ Backend Exists but UI Missing
* 🚫 Not Required

Do not assume a feature is complete because a page exists.

Verify:

* UI
* Backend API
* Database
* Validation
* Permissions
* Error handling

---

# Dashboard

## Overview

[ ] Revenue Cards

[ ] Today's Orders

[ ] Active Tables

[ ] Occupied Tables

[ ] Pending Bills

[ ] Live Orders

[ ] Customer Count

[ ] Average Order Value

[ ] Sales Charts

[ ] Recent Activity

---

# Billing (Highest Priority)

[ ] Generate Bill

[ ] Preview Bill

[ ] GST Calculation

[ ] Service Charge

[ ] Split Bill

[ ] Split Payment

[ ] Multiple Payment Methods

[ ] Cash

[ ] Card

[ ] UPI

[ ] Wallet

[ ] Partial Payment

[ ] Hold Bill

[ ] Resume Bill

[ ] Reprint Bill

[ ] Print Bill

[ ] Email Receipt

[ ] WhatsApp Receipt

[ ] Discount

[ ] Coupon

[ ] Refund

[ ] Void Bill

[ ] Manager Approval

---

# Orders

[ ] View All Orders

[ ] Search Orders

[ ] Filter Orders

[ ] Order Details

[ ] Modify Order

[ ] Cancel Order

[ ] Reprint KOT

[ ] Customer Notes

[ ] Order Timeline

[ ] Order History

---

# Table Management

[ ] Floor Layout

[ ] Merge Tables

[ ] Split Tables

[ ] Temporary Table

[ ] Move Table

[ ] Reserve Table

[ ] QR Management

[ ] Print QR

[ ] Regenerate QR

---

# Menu

[ ] Categories

[ ] Menu Items

[ ] Variants

[ ] Addons

[ ] Combos

[ ] Availability

[ ] Taxes

[ ] Pricing

[ ] Happy Hour Pricing

[ ] Upload Images

[ ] Bulk Import

---

# Customers

[ ] Customer List

[ ] Customer Details

[ ] Order History

[ ] Loyalty

[ ] Wallet

[ ] Feedback

[ ] Complaints

---

# Staff

[ ] Staff List

[ ] Add Staff

[ ] Edit Staff

[ ] Delete Staff

[ ] Roles

[ ] Permissions

[ ] PIN Login

[ ] Attendance

---

# Reports

[ ] Daily Sales

[ ] Weekly Sales

[ ] Monthly Sales

[ ] Payment Report

[ ] Tax Report

[ ] Discount Report

[ ] Customer Report

[ ] Export CSV

[ ] Export Excel

---

# Settings

[ ] Restaurant Details

[ ] Taxes

[ ] Service Charges

[ ] Receipt Template

[ ] Invoice Template

[ ] Printer Settings

[ ] Notification Settings

---

# Security

[ ] Authentication

[ ] RBAC

[ ] Audit Logs

[ ] Session Timeout

[ ] Manager Approval

---

# Existing Pages Found (Based on Current Repository)

## Confirm Existing Functionality

[ ] Dashboard

[ ] Orders

[ ] Order History

[ ] Customers

[ ] Menu

[ ] Delivery Fees

[ ] Complaints

[ ] Banners

---

# Missing Features Recommended

Priority P0 (Must Have Before Launch)

[ ] Complete Billing Module

[ ] Payment Screen

[ ] GST Invoice

[ ] Split Bill

[ ] Payment Methods

[ ] Hold Bill

[ ] Bill Reprint

[ ] QR Management

[ ] Staff Roles

[ ] Restaurant Settings

[ ] Reports Dashboard

[ ] Audit Logs

---

Priority P1

[ ] Discounts

[ ] Coupons

[ ] Customer Loyalty

[ ] Manager Approval

[ ] Refunds

[ ] Table Merge

[ ] Table Split

[ ] Analytics

---

Priority P2
Subscriber

[ ] Multi Outlet

[ ] Offline Billing

[ ] Export Reports

[ ] Kitchen Printer Configuration

[ ] Backup & Restore

[ ] Notification Center

---

## Final Deliverable Required From Coding Agent

After scanning the project, generate a markdown table like this.

| Module        | Status | Missing Work                |
| ------------- | ------ | --------------------------- |
| Billing       | 🟡     | Payment screen, GST invoice |
| Dashboard     | ✅      | None                        |
| Reports       | ❌      | Complete module missing     |
| Customers     | 🟡     | Loyalty and wallet          |
| Staff         | ❌      | Entire module               |
| Settings      | 🟡     | Receipt configuration       |
| Security      | 🟡     | Audit logs                  |
| QR Management | ❌      | Complete module             |

Only after this audit is complete we should start implementation but dont build anything without asking me.
