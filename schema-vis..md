## Table `accounts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `name` | `text` |  |
| `type` | `account_type` |  |
| `institution` | `text` |  Nullable |
| `color` | `text` |  Nullable |
| `icon` | `text` |  Nullable |
| `credit_limit_cents` | `int8` |  Nullable |
| `closing_day` | `int2` |  Nullable |
| `due_day` | `int2` |  Nullable |
| `archived_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `initial_balance` | `numeric` |  |
| `overdraft_limit` | `numeric` |  |
| `overdraft_start_date` | `timestamptz` |  Nullable |
| `initial_balance_cents` | `int8` |  Nullable |
| `overdraft_limit_cents` | `int8` |  Nullable |
| `overdraft_since` | `timestamptz` |  Nullable |

## Table `categories`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Nullable |
| `parent_id` | `uuid` |  Nullable |
| `name` | `text` |  Nullable |
| `kind` | `category_kind` |  Nullable |
| `color` | `text` |  Nullable |
| `icon` | `text` |  Nullable |
| `archived_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `type` | `text` |  Nullable |
| `nature` | `category_nature` |  Nullable |

## Table `transactions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `account_id` | `uuid` |  |
| `category_id` | `uuid` |  Nullable |
| `kind` | `transaction_kind` |  |
| `type` | `transaction_type` |  |
| `amount` | `numeric` |  |
| `occurred_on` | `date` |  |
| `posted_at` | `timestamptz` |  Nullable |
| `description` | `text` |  |
| `notes` | `text` |  Nullable |
| `external_id` | `text` |  Nullable |
| `transfer_id` | `uuid` |  Nullable |
| `recurrence_id` | `uuid` |  Nullable |
| `invoice_id` | `uuid` |  Nullable |
| `paid_invoice_id` | `uuid` |  Nullable |
| `dedup_hash` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `source` | `transaction_source` |  |

## Table `recurrences`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `account_id` | `uuid` |  |
| `category_id` | `uuid` |  |
| `kind` | `transaction_kind` |  |
| `type` | `transaction_type` |  |
| `amount` | `numeric` |  |
| `description` | `text` |  |
| `frequency` | `recurrence_frequency` |  |
| `interval_count` | `int4` |  |
| `day_of_month` | `int4` |  Nullable |
| `start_on` | `date` |  |
| `end_on` | `date` |  Nullable |
| `next_run_on` | `date` |  |
| `active` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `credit_card_invoices`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `account_id` | `uuid` |  |
| `reference_month` | `date` |  |
| `closing_date` | `date` |  |
| `due_date` | `date` |  |
| `status` | `invoice_status` |  |
| `total_amount` | `numeric` |  |
| `paid_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `installment_purchases`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `account_id` | `uuid` |  |
| `category_id` | `uuid` |  Nullable |
| `description` | `text` |  |
| `total_amount` | `numeric` |  |
| `installments_count` | `int4` |  |
| `first_invoice_id` | `uuid` |  Nullable |
| `purchased_on` | `date` |  |
| `status` | `installment_status` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `installment_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `purchase_id` | `uuid` |  |
| `invoice_id` | `uuid` |  Nullable |
| `transaction_id` | `uuid` |  Nullable |
| `installment_number` | `int4` |  |
| `amount` | `numeric` |  |
| `due_date` | `date` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `loans`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `account_id` | `uuid` |  |
| `kind` | `loan_kind` |  |
| `description` | `text` |  |
| `principal_amount` | `numeric` |  |
| `interest_rate` | `numeric` |  Nullable |
| `installments_count` | `int4` |  |
| `installments_paid` | `int4` |  |
| `monthly_due_day` | `int4` |  |
| `start_on` | `date` |  |
| `status` | `loan_status` |  |
| `is_contemplated` | `bool` |  |
| `contemplated_at` | `date` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `budgets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `category_id` | `uuid` |  |
| `amount` | `numeric` |  |
| `reference_month` | `date` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `audit_log`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `action` | `text` |  |
| `payload` | `jsonb` |  |
| `created_at` | `timestamptz` |  |

## Table `classification_rules`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `pattern` | `text` |  |
| `match_type` | `text` |  |
| `category_id` | `uuid` |  |
| `kind` | `category_kind` |  |
| `hit_count` | `int4` |  |
| `last_used_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `chat_threads`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `title` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `chat_messages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `thread_id` | `uuid` |  |
| `role` | `text` |  |
| `content` | `text` |  |
| `created_at` | `timestamptz` |  |

