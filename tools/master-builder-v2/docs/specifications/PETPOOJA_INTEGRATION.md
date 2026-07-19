# PetPooja Integration

## Objectives

Create a near real-time synchronization between PetPooja and The 11th Bean CRM.

## Sync Frequency

- Manual
- Every 5 minutes
- Nightly reconciliation

## Data Imported

### Customers
- Customer ID
- Name
- Phone
- Email

### Bills
- Bill Number
- Date
- Store
- Total
- Discount
- Taxes
- Payment Mode

### Order Items
- Product
- Quantity
- Price

### Loyalty
- Points
- Redemptions

## CRM Behaviour

If customer exists:
- Update profile
- Create visit
- Create timeline event

If customer does not exist:
- Create customer
- Create visit
- Build Customer360 automatically

## Conflict Rules

CRM wins:
- Notes
- Tags
- Communities
- Preferences

PetPooja wins:
- Bills
- Orders
- Payments
- Products

## Failure Handling

- Retry queue
- Error log
- Manual replay
- Audit trail

