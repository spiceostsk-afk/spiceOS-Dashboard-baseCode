# General Coding Agent Guide — Engineering Standards for Production-Grade Code

## How to write Claude Opus-level code: bug-free, stable, secure, maintainable

> **Purpose:** This is the canonical engineering guide for any AI coding agent (Claude, Opus, GPT, Gemini, Cursor, Copilot, etc.) building production software. Every rule exists because real code failed in production without it. Follow this guide to the letter and your code will be indistinguishable from a senior staff engineer's output. Skip rules to "save tokens" and you will produce code that breaks, leaks, and gets rewritten within 6 months.

---

## Table of Contents

1. [Core Philosophy](#1-core-philosophy)
2. [The 25 Iron Rules](#2-the-25-iron-rules)
3. [Architecture Principles](#3-architecture-principles)
4. [Language-Agnostic Patterns](#4-language-agnostic-patterns)
5. [Error Handling Standards](#5-error-handling-standards)
6. [Input Validation](#6-input-validation)
7. [Security Standards](#7-security-standards)
8. [Testing Standards](#8-testing-standards)
9. [Performance Standards](#9-performance-standards)
10. [Documentation Standards](#10-documentation-standards)
11. [Refactoring Principles](#11-refactoring-principles)
12. [Code Review Checklist](#12-code-review-checklist)
13. [Anti-Patterns Encyclopedia](#13-anti-patterns-encyclopedia)
14. [Common Bugs Encyclopedia](#14-common-bugs-encyclopedia)
15. [Reusable Code Patterns](#15-reusable-code-patterns)
16. [Pre-Flight Checklist](#16-pre-flight-checklist)
17. [Testing Protocol](#17-testing-protocol)
18. [AI Agent Meta-Rules](#18-ai-agent-meta-rules)

---

## 1. Core Philosophy

Three principles guide every decision. When in doubt, defer to these in order:

### Principle 1: Correctness Over Cleverness

Code that obviously works beats code that elegantly might work. A 30-line function with explicit if/else branches that a junior dev can read is better than a 5-line functional one-liner using 4 chained higher-order functions that nobody can debug at 2 AM.

**Anti-pattern:** `const result = data?.filter(x => x.active).flatMap(x => transform(x)).reduce((acc, x) => ({...acc, [x.id]: x}), {})`

**Better:** Split into 3 named functions with intermediate variables. You can debug each step.

### Principle 2: Defensive By Default

Every function must assume its input might be:
- `null` / `undefined` / `None`
- Wrong type (string instead of number)
- Empty (empty array, empty string, empty object)
- Massive (10M items instead of 100)
- Out of order
- Duplicated
- Malicious (SQL injection, XSS, path traversal)

A function that crashes on edge cases is worse than no function. Always validate, always fallback, always bound.

### Principle 3: Explicit Over Implicit

Never rely on default behavior. Always specify:
- Types (even in dynamic languages, via type hints or JSDoc)
- Error modes (don't let exceptions silently bubble)
- Configuration (don't read env vars at module load)
- Side effects (don't mutate inputs, don't write to globals)
- Timezones (never use `new Date()` without TZ)

Implicit behavior changes between language versions, libraries, and environments. Explicit settings survive upgrades.

---

## 2. The 25 Iron Rules

Non-negotiable. Violating any of these produces broken or unmaintainable code.

### Rule 1: Never Trust External Input

Every input from outside the function/module/system is untrusted until validated:
- User input (forms, CLI args, env vars)
- API responses (even from your own services)
- Database reads (data may have been corrupted)
- File contents (may be malformed)
- Query parameters
- Webhook payloads

Validate at the boundary. Inside the system, you can trust validated data.

### Rule 2: Validate, Don't Assume

```python
# WRONG
def get_user_email(user_id):
    user = db.find(user_id)
    return user.email  # crashes if user is None

# RIGHT
def get_user_email(user_id):
    user = db.find(user_id)
    if user is None:
        raise UserNotFoundError(f"No user with id={user_id}")
    if not user.email:
        return ""
    return user.email
```

### Rule 3: No Silent Failures

Never swallow exceptions, never return `null` to indicate failure, never log-and-continue without explicit reasoning.

```python
# WRONG
try:
    result = api.call()
except Exception:
    pass  # silently swallows everything

# RIGHT
try:
    result = api.call()
except NetworkError as e:
    logger.warning(f"API network error, will retry: {e}")
    raise RetryableError(e)
except ValidationError as e:
    logger.error(f"API returned invalid data: {e}")
    raise  # propagate, this is a bug
```

### Rule 4: Functions Do One Thing

A function should do exactly one thing, do it well, and do it only. If you can't describe what a function does in one sentence without using "and", it does too much.

**Bad:** `process_user_data_and_send_email_and_update_analytics()`

**Good:** Split into `process_user_data()`, `send_email()`, `update_analytics()`. Orchestrate them at a higher level.

### Rule 5: Maximum 50 Lines Per Function

If a function exceeds 50 lines, extract helper functions. Long functions hide bugs, are hard to test, and impossible to maintain. The 50-line limit forces you to think about abstraction boundaries.

**Exception:** Pure data definitions (large config objects, lookup tables) can be longer.

### Rule 6: No Magic Numbers or Strings

```python
# WRONG
if user.role == 3:
    grant_admin_access()

# RIGHT
ADMIN_ROLE_ID = 3
if user.role == ADMIN_ROLE_ID:
    grant_admin_access()
```

Magic numbers require readers to grep the codebase to understand intent. Named constants document themselves.

### Rule 7: No Nested Ternaries or Deep Nesting

```javascript
// WRONG
const tier = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'F';

// RIGHT
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}
```

Maximum nesting depth: 3 levels. If you have 4+ levels of if/for/while, extract a helper function.

### Rule 8: Pure Functions Where Possible

A pure function:
- Given the same input, always returns the same output
- Has no side effects (no mutation of inputs, no I/O, no global state)

Pure functions are testable, cacheable, parallelizable, and predictable. Prefer them. When you need side effects (database writes, file I/O, network calls), isolate them at the edges of your system.

### Rule 9: Immutable Data By Default

```python
# WRONG (mutating input)
def add_item(cart, item):
    cart.items.append(item)
    return cart

# RIGHT (returning new instance)
def add_item(cart, item):
    return Cart(items=[*cart.items, item], total=cart.total + item.price)
```

Mutation causes subtle bugs when the same object is referenced from multiple places. Immutable updates are predictable.

### Rule 10: Type Hints / TypeScript Everywhere

Even in dynamic languages, declare types:

```python
# Python
def calculate_price(quantity: int, unit_price: float, discount: float = 0.0) -> float:
    ...

# JavaScript (via JSDoc)
/**
 * @param {number} quantity
 * @param {number} unitPrice
 * @param {number} [discount=0]
 * @returns {number}
 */
function calculatePrice(quantity, unitPrice, discount = 0) { ... }

# TypeScript
function calculatePrice(quantity: number, unitPrice: number, discount: number = 0): number { ... }
```

Types catch 80% of bugs at compile time. Use them religiously.

### Rule 11: Handle Errors at the Right Level

Don't catch errors you can't handle. Don't let errors bubble past where they should be handled.

- **Network error in API call?** Retry at the service layer, propagate to caller if retries exhausted.
- **Validation error in user input?** Return 400 Bad Request at the controller layer.
- **Database connection error?** Fail fast, alert ops, don't retry endlessly.
- **Bug (NullPointer, IndexError)?** Don't catch. Let it crash, fix the bug.

### Rule 12: Idempotency for All Write Operations

Any function that writes data (DB, file, API) must be safe to retry. If it runs twice, the result should be the same as running once.

Use:
- Unique constraints + ON CONFLICT DO NOTHING (SQL)
- Idempotency keys (APIs)
- Versioning / ETags
- Deterministic file names

### Rule 13: Logs Are for Operators, Not Developers

```python
# WRONG (developer-focused)
logger.info(f"Processing user {user.id}")  # operators don't care

# RIGHT (operator-focused)
logger.info("user_processed", extra={
    "user_id": user.id,
    "duration_ms": elapsed,
    "source": "webhook"
})
```

Logs should answer: what happened, to what, when, why, and what's the impact. Use structured logging (JSON) with searchable fields.

### Rule 14: No `console.log` / `print` in Production Code

Use a real logging library (`logging` in Python, `winston`/`pino` in Node, `logrus` in Go). `print` statements:
- Can't be filtered by level
- Can't be routed to different destinations
- Don't include timestamps, source, correlation IDs
- Pollute stdout, breaking pipes

### Rule 15: Configuration via Environment, Not Code

```python
# WRONG
DATABASE_URL = "postgresql://user:pass@localhost:5432/db"  # hardcoded

# RIGHT
DATABASE_URL = os.environ["DATABASE_URL"]  # required, fails fast if missing
DATABASE_POOL_SIZE = int(os.environ.get("DATABASE_POOL_SIZE", "10"))  # with default
```

Never commit secrets. Never hardcode environment-specific values. Fail fast on missing required config.

### Rule 16: Database Migrations Are Immutable

Once a migration is deployed, never edit it. Write a new migration to undo or change it. This ensures:
- Production databases match the migration history
- Rollbacks are predictable
- Multiple developers don't conflict

### Rule 17: Tests Are Not Optional

Every function with branching logic must have tests:
- Happy path (1 test)
- Edge cases (empty, null, max, min) — 2-4 tests
- Error cases (invalid input, exceptions) — 2-3 tests
- Integration points (mocked or real) — 1-2 tests

Minimum 5 tests per function. No PR merges without tests.

### Rule 18: Tests Are Code, Treat Them Like Code

Test code follows the same standards as production code:
- No duplication (use fixtures, factories, helpers)
- No magic numbers (use named constants)
- No nested setup (extract helpers)
- One assertion per test (or one logical assertion)
- Test names describe behavior: `test_calculate_price_applies_discount_for_vip_customer`

### Rule 19: No `any` / `Object` / Untyped Dicts

```typescript
// WRONG
function process(data: any) { ... }

// RIGHT
interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}
function process(data: User) { ... }
```

`any` disables type checking. If you don't know the type, define it. If you can't define it, use `unknown` and narrow with type guards.

### Rule 20: Comments Explain Why, Not What

```python
# WRONG (describes what the code does — readable from the code itself)
# Increment counter by 1
counter += 1

# RIGHT (explains why — context the code can't convey)
# Increment to account for the header row that was stripped above
counter += 1
```

Code is the what. Comments are the why. If a comment just restates the code, delete the comment.

### Rule 21: No Premature Optimization

> "Premature optimization is the root of all evil." — Donald Knuth

Don't optimize code that isn't measured as slow. Don't add caching, pooling, or async until you have a benchmark showing the simple version is too slow. Optimized code is harder to read and bug-prone.

**Exception:** Obvious O(n²) → O(n) improvements are fine. Database queries in loops are not.

### Rule 22: Dependencies Are Liability

Every external dependency is:
- A security risk (supply chain attacks)
- A maintenance burden (breaking changes)
- A build complexity
- A bundle size

Add a dependency only if:
1. It saves >100 lines of code you'd otherwise write
2. It's actively maintained (last commit <6 months)
3. It has >1K GitHub stars OR is from a trusted org
4. The license is compatible (MIT, Apache, BSD)

Otherwise, write the 100 lines yourself.

### Rule 23: Backwards Compatibility Until Deprecated

Never break the public API without:
1. Marking old API as `@deprecated` with a migration guide
2. Waiting at least 1 minor version
3. Logging warnings when deprecated API is used
4. Updating all internal callers
5. Then removing in a major version

### Rule 24: Time is Hard — Use a Library

Never hand-roll date/time logic. Use:
- Python: `pendulum` or `arrow` (not `datetime` alone)
- JavaScript: `date-fns` or `luxon` (not `Date` alone)
- Always store UTC, display in user's TZ
- Never use `new Date(string)` for parsing — use ISO 8601 + library

Timezones, DST, leap seconds, and locale formatting will eat you alive. Libraries handle this. You don't.

### Rule 25: Security Is Not a Feature

Security is not something you "add later." Every line of code is either secure-by-default or vulnerable-by-default. Specifically:
- Never concatenate SQL — use parameterized queries
- Never interpolate user input into HTML — use templates with auto-escaping
- Never trust client-side validation — validate on the server
- Never store passwords in plaintext — use bcrypt/argon2
- Never log secrets — redact before logging
- Never disable certificate verification

---

## 3. Architecture Principles

### 3.1 Separation of Concerns

Different concerns live in different layers:
- **Controllers / Handlers** — parse input, call service, format response
- **Services / Business Logic** — apply rules, orchestrate calls
- **Repositories / Data Access** — DB queries, no business logic
- **Models / Entities** — data shapes, no behavior beyond validation
- **Views / Templates** — presentation only, no logic

A controller that contains SQL queries is wrong. A model that calls external APIs is wrong. A service that returns HTML is wrong.

### 3.2 Dependency Inversion

High-level modules should not depend on low-level modules. Both should depend on abstractions.

```python
# WRONG (high-level depends on low-level)
class OrderService:
    def __init__(self):
        self.stripe = StripeClient()  # concrete dependency
        self.db = PostgresClient()    # concrete dependency

# RIGHT (depends on abstractions)
class OrderService:
    def __init__(self, payment_gateway: PaymentGateway, db: Repository):
        self.payment_gateway = payment_gateway
        self.db = db
```

This enables testing (inject mocks) and swapping implementations (Stripe → PayPal).

### 3.3 Single Source of Truth

Each piece of data has ONE authoritative source. Duplicates drift.

- User's email: stored in `users` table, nowhere else
- App config: stored in env vars or config service, not hardcoded
- Feature flags: stored in flag service, not in code

If you need to display user email in 5 places, all 5 read from `users` table. Don't cache copies.

### 3.4 Stateless Services

Web services should be stateless. State lives in:
- Database (persistent)
- Cache (ephemeral but shared)
- Client (cookies, tokens)

Stateless services can be scaled horizontally without coordination. Stateful services require sticky sessions, distributed locks, and complex failover.

### 3.5 Boundaries Are Explicit

Every module/service has a public API (the contract) and a private implementation (the internals). Other modules use only the public API. Internal changes don't break callers.

**Bad:** `import { helperFunction } from './user-service/internals'`

**Good:** `import { getUserById } from './user-service'`

### 3.6 Fail Fast, Fail Loud

Detect errors as early as possible:
- Validate input at the boundary (controller, API client)
- Fail on missing config at startup, not at first use
- Use assertions for invariants in development
- Crash on bugs (NullPointer), don't try to recover

### 3.7 The 12-Factor App

Follow [12factor.net](https://12factor.net):
1. Codebase — one codebase per app, many deploys
2. Dependencies — explicit, isolated
3. Config — in environment, not code
4. Backing services — treated as attached resources
5. Build, release, run — strictly separated
6. Processes — stateless, share nothing
7. Port binding — self-contained, exposes HTTP
8. Concurrency — via processes
9. Disposability — fast startup, graceful shutdown
10. Dev/prod parity — keep them as similar as possible
11. Logs — event stream
12. Admin processes — one-off tasks

---

## 4. Language-Agnostic Patterns

### 4.1 The Null Object Pattern

Instead of returning `null` / `None` / `undefined`, return a "null object" that has the same interface but does nothing.

```python
# WRONG
def get_logger():
    if config.debug:
        return RealLogger()
    return None  # callers must null-check

# RIGHT
class NullLogger:
    def info(self, msg): pass
    def error(self, msg): pass

def get_logger():
    return RealLogger() if config.debug else NullLogger()
```

Callers never null-check. Behavior is consistent.

### 4.2 The Result Type (for languages without exceptions)

In Go, Rust, or when you want explicit error handling:

```rust
fn parse_int(s: &str) -> Result<i32, ParseError> {
    // ...
}

match parse_int(input) {
    Ok(n) => println!("Parsed: {}", n),
    Err(e) => println!("Failed: {}", e),
}
```

Forces the caller to handle the error case. No silent failures.

### 4.3 The Builder Pattern for Complex Construction

```python
# WRONG (constructor with 10 params)
query = Query("users", "select", ["id", "name"], where=[...], order_by=[...], limit=10, offset=0, ...)

# RIGHT (builder)
query = (QueryBuilder()
    .table("users")
    .select("id", "name")
    .where("active", True)
    .order_by("created_at", desc=True)
    .limit(10)
    .build())
```

### 4.4 The Repository Pattern for Data Access

```python
# WRONG (SQL scattered across services)
class UserService:
    def get_user(self, user_id):
        cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")  # SQL injection!
        return cursor.fetchone()

# RIGHT (repository abstraction)
class UserRepository:
    def find_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query("SELECT * FROM users WHERE id = %s", (user_id,))

class UserService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo
    
    def get_user(self, user_id: int) -> User:
        user = self.user_repo.find_by_id(user_id)
        if not user:
            raise UserNotFoundError(user_id)
        return user
```

### 4.5 The Strategy Pattern for Variable Behavior

```python
# WRONG (if/else chains)
def calculate_discount(customer):
    if customer.tier == 'bronze':
        return 0.05
    elif customer.tier == 'silver':
        return 0.10
    elif customer.tier == 'gold':
        return 0.15
    # add a new tier, modify this function

# RIGHT (strategy)
DISCOUNT_STRATEGIES = {
    'bronze': BronzeDiscount(),
    'silver': SilverDiscount(),
    'gold': GoldDiscount(),
}

def calculate_discount(customer):
    strategy = DISCOUNT_STRATEGIES.get(customer.tier)
    if not strategy:
        raise ValueError(f"Unknown tier: {customer.tier}")
    return strategy.calculate(customer)
```

### 4.6 The Adapter Pattern for External Dependencies

Wrap external APIs/libraries behind your own interface. If the external API changes, you update one adapter, not 50 call sites.

```python
class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, amount: int, currency: str, customer_id: str) -> ChargeResult:
        ...

class StripeAdapter(PaymentGateway):
    def __init__(self, stripe_client):
        self.stripe = stripe_client
    
    def charge(self, amount, currency, customer_id):
        # translate to Stripe's API
        result = self.stripe.charges.create(...)
        # translate from Stripe's response
        return ChargeResult(id=result.id, status=result.status)
```

---

## 5. Error Handling Standards

### 5.1 Use Specific Exception Types

```python
# WRONG
raise Exception("User not found")

# RIGHT
class UserNotFoundError(Exception):
    def __init__(self, user_id):
        super().__init__(f"User not found: {user_id}")
        self.user_id = user_id

raise UserNotFoundError(user_id)
```

Callers can catch specific types, not parse error messages.

### 5.2 Exceptions vs Return Codes

**Use exceptions for:**
- Unexpected errors (DB connection lost, file not found)
- Bugs (null reference, index out of bounds)
- Conditions that propagate up many call frames

**Use return codes / Result types for:**
- Expected failures (user not found, validation failed)
- Business rules (insufficient funds, quota exceeded)
- Conditions handled by immediate caller

### 5.3 The Try-Catch Boundary

Catch exceptions only where you can actually handle them:
- **Retry** (transient network errors)
- **Fallback** (use cached data if API fails)
- **Translate** (low-level error → domain error)
- **Recover** (skip bad record, continue batch)
- **Log and re-raise** (rare — usually you should just let it propagate)

If you can't do any of these, don't catch. Let it propagate.

### 5.4 Always Clean Up Resources

```python
# WRONG (file not closed on exception)
def read_config(path):
    f = open(path)
    data = f.read()
    parse(data)  # if this throws, file leaks
    f.close()
    return data

# RIGHT (context manager)
def read_config(path):
    with open(path) as f:
        data = f.read()
    return parse(data)
```

In other languages:
- Go: `defer file.Close()`
- JavaScript: `try { ... } finally { ... }`
- Java: try-with-resources
- Rust: RAII (automatic on drop)

### 5.5 Async Error Handling

```javascript
// WRONG (errors silently swallowed)
async function fetchData() {
  const data = await fetch('/api/data');
  return data.json();  // if fetch throws, undefined returned
}

// RIGHT
async function fetchData() {
  let response;
  try {
    response = await fetch('/api/data');
  } catch (error) {
    throw new NetworkError(`Failed to fetch /api/data: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new ApiError(`API returned ${response.status}`, response.status);
  }
  
  return response.json();
}
```

### 5.6 Circuit Breaker for External Calls

When calling external services, use a circuit breaker to fail fast when the service is down:

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, reset_timeout=60):
        self.failures = 0
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half-open
    
    def call(self, func, *args, **kwargs):
        if self.state == 'open':
            if time.time() - self.last_failure_time > self.reset_timeout:
                self.state = 'half-open'
            else:
                raise CircuitOpenError()
        
        try:
            result = func(*args, **kwargs)
            self.failures = 0
            self.state = 'closed'
            return result
        except Exception:
            self.failures += 1
            self.last_failure_time = time.time()
            if self.failures >= self.failure_threshold:
                self.state = 'open'
            raise
```

---

## 6. Input Validation

### 6.1 Validate at the Boundary

Validate input at the system boundary (API controller, CLI parser, event handler). Inside the system, trust validated data.

```python
# WRONG (validation scattered)
def create_user(name, email, age):
    if not name:
        raise ValueError("Name required")
    if '@' not in email:
        raise ValueError("Invalid email")
    if age < 0:
        raise ValueError("Age must be positive")
    # ... create user

# Use this 50 times in your code, and you'll forget validation in 5 places.

# RIGHT (validate once, trust everywhere)
class CreateUserRequest:
    def __init__(self, name: str, email: str, age: int):
        if not name or len(name) > 100:
            raise ValidationError("name", "must be 1-100 chars")
        if not re.match(EMAIL_REGEX, email):
            raise ValidationError("email", "invalid format")
        if not (0 <= age <= 150):
            raise ValidationError("age", "must be 0-150")
        
        self.name = name
        self.email = email
        self.age = age

# Controller:
def handle_create_user(request_body):
    req = CreateUserRequest(**request_body)  # validates
    return user_service.create(req)  # service trusts the validated object
```

### 6.2 Use Schema Validation Libraries

Don't hand-roll validation. Use:
- Python: `pydantic`, `marshmallow`
- JavaScript/TypeScript: `zod`, `joi`, `yup`
- Go: `go-playground/validator`
- Rust: `serde` + `validator`

```python
# Python with pydantic
from pydantic import BaseModel, EmailStr, Field

class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(ge=0, le=150)

# Automatically validates on instantiation
# Raises ValidationError with detailed field errors
```

### 6.3 Whitelist, Don't Blacklist

```python
# WRONG (blacklist — fragile, attacker finds new bad inputs)
FORBIDDEN_CHARS = ['<', '>', '"', "'", '&']
def sanitize(input):
    for char in FORBIDDEN_CHARS:
        input = input.replace(char, '')
    return input

# RIGHT (whitelist — only known-good chars allowed)
ALLOWED_CHARS = set(string.ascii_letters + string.digits + ' -_')
def sanitize(input):
    return ''.join(c for c in input if c in ALLOWED_CHARS)
```

### 6.4 Bound Everything

Every input must have bounds:
- Strings: max length
- Arrays: max size
- Numbers: min/max range
- Dates: not in the past / not too far in the future
- File uploads: max size, allowed MIME types

```python
MAX_QUERY_RESULTS = 100

def search(query: str, limit: int = 10) -> List[Result]:
    if len(query) > 200:
        raise ValidationError("query too long")
    limit = min(limit, MAX_QUERY_RESULTS)  # cap at 100
    return search_engine.search(query, limit=limit)
```

---

## 7. Security Standards

### 7.1 Authentication vs Authorization

- **Authentication** = who are you? (login, token validation)
- **Authorization** = what can you do? (permission check)

Both are required. Authenticate first, then authorize every action.

```python
# WRONG (authenticates but doesn't authorize)
@app.route("/users/{user_id}/delete", methods=["POST"])
@require_login
def delete_user(user_id):
    db.delete_user(user_id)  # any logged-in user can delete any user!

# RIGHT
@app.route("/users/{user_id}/delete", methods=["POST"])
@require_login
def delete_user(user_id, current_user):
    if not current_user.can_delete(user_id):
        raise ForbiddenError()
    db.delete_user(user_id)
```

### 7.2 SQL Injection — Use Parameterized Queries

```python
# WRONG (SQL injection vulnerability)
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# RIGHT (parameterized)
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

This applies to every database. Use the parameter binding your driver provides.

### 7.3 XSS — Auto-Escape Output

```python
# WRONG (XSS vulnerability)
return f"<div>{user_input}</div>"

# RIGHT (use template engine with auto-escaping)
return render_template("user.html", data=user_input)
```

In React/Vue/Angular, output is auto-escaped by default. Don't use `dangerouslySetInnerHTML` / `v-html` unless you've sanitized the input.

### 7.4 CSRF — Use Tokens

For state-changing requests (POST/PUT/DELETE), require a CSRF token:
- Generate per session
- Include in form / header
- Validate on server

Frameworks (Django, Rails, Next.js) have built-in CSRF middleware. Use it.

### 7.5 Passwords — Hash with bcrypt or argon2

```python
# WRONG (plaintext or weak hash)
db.save_user(email, password)  # plaintext!
db.save_user(email, hashlib.md5(password.encode()).hexdigest())  # broken

# RIGHT (bcrypt with cost factor)
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())
```

### 7.6 Secrets Management

- Never commit secrets to git
- Use environment variables for local dev
- Use a secrets manager for production (AWS Secrets Manager, HashiCorp Vault, Doppler)
- Rotate secrets regularly
- Have different secrets for dev/staging/prod
- Add secrets to `.gitignore` and `.env.example` (without values)

### 7.7 Rate Limiting

Every public endpoint must have rate limiting:
- Per IP: 100 requests/minute
- Per user: 1000 requests/hour
- Per expensive operation: 10/hour

```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@app.route("/api/expensive")
@limiter.limit("10/hour")
def expensive_op():
    ...
```

### 7.8 HTTPS Everywhere

- Force HTTPS (redirect HTTP → HTTPS)
- Use HSTS headers
- Use modern TLS (1.2+)
- Never disable certificate verification in production
- Use Let's Encrypt for free certs

### 7.9 Input Sanitization for Storage

Before storing user input:
- Trim whitespace
- Remove control characters
- Normalize Unicode (NFC)
- Validate length limits

```python
def sanitize_for_storage(value: str, max_length: int = 1000) -> str:
    if not value:
        return ''
    return unicodedata.normalize('NFC', value).strip()[:max_length]
```

### 7.10 Audit Logging

Log every security-relevant action:
- Login attempts (success + failure)
- Password changes
- Permission grants
- Data exports
- Admin actions

```python
logger.info("security_event", extra={
    "event": "login_success",
    "user_id": user.id,
    "ip": request.remote_addr,
    "user_agent": request.headers.get("User-Agent"),
    "timestamp": datetime.utcnow().isoformat()
})
```

---

## 8. Testing Standards

### 8.1 The Testing Pyramid

```
        /\
       /E2E\        ← few, slow, expensive
      /------\
     /Integ.  \     ← some, medium speed
    /----------\
   /   Unit     \   ← many, fast, cheap
  /--------------\
```

- **Unit tests** (80%): test individual functions in isolation
- **Integration tests** (15%): test multiple components together (DB, API)
- **E2E tests** (5%): test the full system as a user would

### 8.2 Test Structure: Arrange-Act-Assert

```python
def test_calculate_price_applies_discount():
    # Arrange
    cart = Cart(items=[Item(price=100)], customer=Customer(tier='gold'))
    
    # Act
    total = calculate_price(cart)
    
    # Assert
    assert total == 85  # 100 - 15% gold discount
```

Each test has clear sections. No mixing of setup, action, and verification.

### 8.3 Test Naming

```
test_<function>_<scenario>_<expected_outcome>

test_calculate_price_with_empty_cart_returns_zero
test_calculate_price_with_negative_quantity_raises_error
test_calculate_price_with_gold_customer_applies_15_percent_discount
```

Test names should read like sentences describing behavior.

### 8.4 One Assertion Per Test (Mostly)

```python
# WRONG (multiple unrelated assertions)
def test_user():
    user = create_user("alice@example.com")
    assert user.email == "alice@example.com"
    assert user.role == "user"
    assert user.created_at is not None
    assert user.is_active is True

# RIGHT (focused tests)
def test_create_user_sets_email():
    user = create_user("alice@example.com")
    assert user.email == "alice@example.com"

def test_create_user_defaults_to_user_role():
    user = create_user("alice@example.com")
    assert user.role == "user"
```

Exception: testing all fields of a data class can be one test.

### 8.5 Use Factories, Not Manual Construction

```python
# WRONG (manual setup repeated in every test)
def test_user_login():
    user = User(id=1, email="test@example.com", password=hash("pass"), role="user", active=True, ...)
    ...

def test_user_logout():
    user = User(id=1, email="test@example.com", password=hash("pass"), role="user", active=True, ...)
    ...

# RIGHT (factory)
import factory

class UserFactory(factory.Factory):
    class Meta:
        model = User
    id = factory.Sequence(lambda n: n)
    email = factory.LazyAttribute(lambda obj: f"user{obj.id}@example.com")
    password = factory.LazyFunction(lambda: hash_password("default"))
    role = "user"
    active = True

def test_user_login():
    user = UserFactory.build()
    ...

def test_user_logout():
    user = UserFactory.build()
    ...
```

### 8.6 Mock External Dependencies

```python
# WRONG (real DB call in unit test)
def test_get_user():
    user = get_user(1)  # hits real DB
    assert user is not None

# RIGHT (mocked)
from unittest.mock import Mock

def test_get_user():
    mock_repo = Mock()
    mock_repo.find_by_id.return_value = User(id=1, email="test@example.com")
    service = UserService(mock_repo)
    
    user = service.get_user(1)
    
    assert user.email == "test@example.com"
    mock_repo.find_by_id.assert_called_once_with(1)
```

### 8.7 Test Coverage ≠ Code Quality

100% coverage doesn't mean your code is well-tested. Coverage tells you what code RAN during tests, not what code was ASSERTED on. Aim for:
- 80%+ coverage on critical paths
- 100% on pure functions (easy)
- 60%+ on UI controllers (harder)
- Coverage of edge cases, not just happy paths

### 8.8 Property-Based Testing

For functions with many input combinations, use property-based tests:

```python
from hypothesis import given, strategies as st

@given(st.integers(min_value=0), st.integers(min_value=0))
def test_addition_is_commutative(a, b):
    assert add(a, b) == add(b, a)

@given(st.lists(st.integers()))
def test_sort_is_idempotent(lst):
    assert sort(sort(lst)) == sort(lst)
```

Hypothesis (Python), fast-check (JS), jqwik (Java) generate hundreds of test cases automatically.

### 8.9 Test the Public API, Not Implementation

Tests should verify behavior, not internal state. If you refactor internals, tests shouldn't break.

```python
# WRONG (tests internal state)
def test_user_service():
    service = UserService()
    service._load_cache()  # testing private method
    assert len(service._cache) > 0  # testing internal field

# RIGHT (tests public behavior)
def test_user_service():
    service = UserService()
    user = service.get_user(1)
    assert user is not None
```

---

## 9. Performance Standards

### 9.1 Measure Before Optimizing

Never optimize without a benchmark. Use:
- Python: `pytest-benchmark`, `cProfile`
- JavaScript: `benchmark.js`, Chrome DevTools
- Go: `benchstat`, pprof
- Database: `EXPLAIN ANALYZE`

> "We should forget about small efficiencies, say about 97% of the time: premature optimization is the root of all evil." — Knuth

### 9.2 N+1 Query Detection

The #1 performance killer in web apps:

```python
# WRONG (N+1 queries — one per user)
users = db.query("SELECT * FROM users")
for user in users:
    orders = db.query("SELECT * FROM orders WHERE user_id = %s", (user.id,))  # N queries!
    user.orders = orders

# RIGHT (1 query with JOIN)
users = db.query("""
    SELECT u.*, o.id as order_id, o.total as order_total
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
""")
# group by user_id in Python
```

### 9.3 Cache Expensive Operations

Cache when:
- Same input → same output (pure function)
- Operation is slow (>100ms)
- Result is reused
- Stale data is acceptable

```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def expensive_computation(input_str: str) -> Result:
    # ... slow operation
    return result
```

Cache invalidation is hard. Use TTLs (time-to-live) as a safety net — even if you forget to invalidate, the cache expires.

### 9.4 Paginate Everything

Never return unbounded collections:
- API endpoints: max 100 items per page
- DB queries: `LIMIT` + `OFFSET` (or cursor pagination)
- UI lists: virtualized rendering

```python
@app.route("/api/users")
def list_users(cursor: str = None, limit: int = 50):
    limit = min(limit, 100)  # cap at 100
    users, next_cursor = user_repo.list(cursor=cursor, limit=limit)
    return {"users": users, "next_cursor": next_cursor}
```

### 9.5 Async I/O for Concurrent Operations

```python
# WRONG (sequential — 3 seconds total)
async def fetch_user_data(user_id):
    profile = await fetch_profile(user_id)      # 1s
    orders = await fetch_orders(user_id)        # 1s
    reviews = await fetch_reviews(user_id)      # 1s
    return {**profile, "orders": orders, "reviews": reviews}

# RIGHT (concurrent — 1 second total)
async def fetch_user_data(user_id):
    profile, orders, reviews = await asyncio.gather(
        fetch_profile(user_id),
        fetch_orders(user_id),
        fetch_reviews(user_id)
    )
    return {**profile, "orders": orders, "reviews": reviews}
```

### 9.6 Database Indexes

Add indexes for:
- Foreign keys (automatic in some DBs)
- Columns in WHERE clauses
- Columns in ORDER BY
- Columns in JOIN conditions

Don't over-index — every index slows down writes.

```sql
-- Check slow queries
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123 ORDER BY created_at DESC;

-- If slow, add index
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
```

### 9.7 Connection Pooling

Database connections are expensive. Pool them:

```python
# Python with SQLAlchemy
from sqlalchemy import create_engine
engine = create_engine(
    DATABASE_URL,
    pool_size=10,        # 10 persistent connections
    max_overflow=20,     # allow 20 more under load
    pool_pre_ping=True,  # check connection is alive before use
    pool_recycle=3600    # recycle connections every hour
)
```

### 9.8 Lazy Loading

Don't load data you might not need:

```python
# WRONG (loads everything)
class User:
    def __init__(self, id, name, orders, reviews, ...):
        self.orders = orders  # loaded even if not used

# RIGHT (lazy property)
class User:
    @property
    def orders(self):
        if self._orders is None:
            self._orders = order_repo.find_by_user(self.id)
        return self._orders
```

---

## 10. Documentation Standards

### 10.1 Self-Documenting Code

The best documentation is code that explains itself:
- Descriptive variable names (`user_count` not `n`)
- Descriptive function names (`calculate_monthly_revenue` not `calc_rev`)
- Small functions with single responsibility
- Type hints
- No magic numbers

If code needs a comment to explain WHAT it does, refactor the code.

### 10.2 Comments Explain WHY

```python
# WHY we add 1 here:
# The API returns 0-indexed pages, but our DB is 1-indexed
page_number = api_page + 1

# WHY we use 5 second timeout:
# Upstream service has a 4s p99, so 5s gives margin without hanging
TIMEOUT = 5

# WHY we sort in reverse:
# Latest first — matches user expectation from the UI
items.sort(key=lambda x: x.created_at, reverse=True)
```

### 10.3 Docstrings for Public APIs

```python
def calculate_discount(customer: Customer, order_total: float) -> float:
    """
    Calculate the discount percentage for a customer's order.
    
    Args:
        customer: The customer making the purchase.
        order_total: The pre-tax total in USD.
    
    Returns:
        Discount as a decimal (0.15 = 15%).
    
    Raises:
        ValueError: If order_total is negative.
    
    Example:
        >>> calculate_discount(gold_customer, 100.0)
        0.15
    """
    if order_total < 0:
        raise ValueError("order_total must be non-negative")
    return DISCOUNT_RATES.get(customer.tier, 0)
```

### 10.4 README.md for Every Project

Every project must have a README with:
- Project name + one-line description
- Setup instructions (clone, install, configure, run)
- Usage examples
- Development workflow (run tests, lint, build)
- Deployment instructions
- Architecture overview (high-level diagram or description)
- Links to docs, issue tracker, CI

### 10.5 Architecture Decision Records (ADRs)

For every significant architectural decision, write an ADR:

```markdown
# ADR-001: Use PostgreSQL for primary database

## Status
Accepted (2025-06-29)

## Context
We need a relational database that supports transactions, JSON columns, and full-text search.

## Decision
Use PostgreSQL 15+.

## Consequences
- Pro: ACID transactions, mature ecosystem
- Pro: JSON columns for flexible schemas
- Con: More complex than SQLite for local dev
- Con: Requires connection pooling
```

### 10.6 API Documentation

For every API endpoint:
- HTTP method + path
- Request body schema (with examples)
- Response schemas (success + error)
- Authentication required
- Rate limits
- Example curl command

Use OpenAPI/Swagger for auto-generated docs.

---

## 11. Refactoring Principles

### 11.1 Refactor in Small Steps

Never rewrite a module in one pass. Refactor in 5-15 minute steps:
1. Extract a function
2. Run tests (must pass)
3. Rename a variable
4. Run tests
5. Simplify a conditional
6. Run tests
7. Commit

If tests fail, you know exactly which step broke it.

### 11.2 Boy Scout Rule

> "Leave the code better than you found it."

Every time you touch a file, make one small improvement:
- Fix a typo in a comment
- Rename an unclear variable
- Extract a small function
- Add a missing type hint

These compound. Over months, the codebase improves.

### 11.3 Don't Refactor + Change Behavior Simultaneously

Two kinds of changes:
- **Refactoring**: changes structure, not behavior
- **Feature work**: changes behavior, not structure

Never do both in the same commit. If you refactor and add a feature together, you can't tell if a bug was introduced by the refactor or the feature.

### 11.4 Tests Enable Refactoring

You can only refactor safely if tests verify behavior. Without tests, "refactoring" is "breaking things slowly."

Before refactoring untested code:
1. Write characterization tests (capture current behavior, even if buggy)
2. Refactor
3. Tests still pass → behavior preserved

### 11.5 When to Refactor

Refactor when:
- You're adding a feature and the code resists your change
- You're fixing a bug and the code is hard to understand
- You're reviewing a PR and the code is unclear
- You're preparing for a known upcoming change

Don't refactor when:
- Deadline is tomorrow
- You don't have tests
- You're tired or rushed
- The code works and you're just bored

---

## 12. Code Review Checklist

When reviewing code (your own or others'), verify:

### 12.1 Correctness
- [ ] Does the code do what it claims?
- [ ] Are edge cases handled (null, empty, max, min)?
- [ ] Are error paths tested?
- [ ] Does it handle concurrent access safely?
- [ ] Are there off-by-one errors in loops?

### 12.2 Security
- [ ] Input validated at boundaries?
- [ ] SQL parameterized (no string concatenation)?
- [ ] Output escaped for XSS?
- [ ] Authentication + authorization checked?
- [ ] No secrets in code or logs?
- [ ] Rate limiting on public endpoints?

### 12.3 Performance
- [ ] No N+1 queries?
- [ ] No unbounded loops on user input?
- [ ] Pagination on list endpoints?
- [ ] Expensive operations cached?
- [ ] Async I/O for concurrent operations?

### 12.4 Maintainability
- [ ] Functions <50 lines?
- [ ] Nesting depth ≤3?
- [ ] Descriptive names?
- [ ] No magic numbers/strings?
- [ ] Single responsibility?
- [ ] No dead code?

### 12.5 Testing
- [ ] Tests cover happy path?
- [ ] Tests cover edge cases?
- [ ] Tests cover error cases?
- [ ] Tests are fast (<1s each)?
- [ ] Tests don't depend on order?
- [ ] Tests don't depend on external state?

### 12.6 Style
- [ ] Consistent with codebase conventions?
- [ ] Follows language style guide (PEP 8, ESLint, etc.)?
- [ ] No commented-out code?
- [ ] No `console.log` / `print` in production code?
- [ ] Comments explain why, not what?

### 12.7 Dependencies
- [ ] New dependency justified (>100 lines saved)?
- [ ] Dependency actively maintained?
- [ ] Dependency license compatible?
- [ ] Pinned version (not `latest`)?

---

## 13. Anti-Patterns Encyclopedia

### 13.1 God Object

A class that knows too much and does too much.

**Symptoms:** 50+ methods, 1000+ lines, every feature touches it.

**Fix:** Split into cohesive smaller classes.

### 13.2 Spaghetti Code

No clear structure, control flow jumps between layers.

**Symptoms:** UI code calls DB directly, business logic in templates, callbacks 5 levels deep.

**Fix:** Define layers (controller → service → repository), enforce boundaries.

### 13.3 Magic Numbers

Unexplained constants scattered in code.

**Fix:** Extract to named constants at top of file/module.

### 13.4 Primitive Obsession

Using primitives (strings, ints) instead of value objects.

**Symptoms:** `def transfer(from_account: str, to_account: str, amount: float)` — no type safety, easy to swap params.

**Fix:** Define `Account` and `Money` types.

### 13.5 Long Parameter List

Functions with 5+ parameters.

**Fix:** Group related params into an object. Use builder pattern.

### 13.6 Shotgun Surgery

One logical change requires editing 10 files.

**Symptoms:** Adding a field to User requires changes in model, controller, service, 3 views, 2 tests, migration, DTO, serializer...

**Fix:** Cohesion — group related changes into modules.

### 13.7 Feature Envy

A method that's more interested in another class than its own.

**Symptoms:** `class Order { def get_user_email() { return user.email + user.name } }` — Order is doing User's job.

**Fix:** Move the method to the class it belongs to.

### 13.8 Data Clumps

Same 3-4 fields always passed together (e.g., `street, city, state, zip`).

**Fix:** Extract to a value object (`Address`).

### 13.9 Dead Code

Code that's never executed.

**Symptoms:** Commented-out blocks, unused functions, unreachable branches.

**Fix:** Delete it. Git remembers if you need it back.

### 13.10 Premature Abstraction

Building abstractions before you have 3 concrete examples.

**Symptoms:** Generic `BaseProcessor` with one subclass, interfaces with one implementation.

**Fix:** Wait until you have 3 examples, then abstract. See "Rule of Three."

### 13.11 Not Invented Here Syndrome

Rebuilding what already exists because "we can do it better."

**Fix:** Use the library. If it doesn't fit, contribute upstream. Your version will have bugs you don't know about.

### 13.12 Golden Hammer

Using one tool/technology for everything because you know it.

**Symptoms:** Using Redis for relational data, using SQL for everything including search, using React for a static site.

**Fix:** Use the right tool for the job. Learn new tools.

### 13.13 Bikeshedding

Endless debate on trivial matters (the color of the bike shed) while important decisions are rushed.

**Fix:** Timebox discussions. Discuss important decisions first.

### 13.14 Sunk Cost Fallacy

Continuing to invest in a bad approach because you've already invested.

**Fix:** Evaluate based on future costs, not past. Be willing to throw away code.

### 13.15 YAGNI Violation

"You Aren't Gonna Need It" — building features for hypothetical future needs.

**Symptoms:** Abstract config systems for "when we'll have 100 envs" (you have 2), plugin systems for "third-party extensions" (none exist).

**Fix:** Build for current needs. Make it extensible, don't pre-build extensions.

---

## 14. Common Bugs Encyclopedia

### 14.1 Off-By-One Errors

```python
# WRONG (iterates n-1 times, misses last element)
for i in range(len(items) - 1):
    process(items[i])

# RIGHT
for i in range(len(items)):
    process(items[i])

# Or better:
for item in items:
    process(item)
```

### 14.2 Null Dereference

```python
# WRONG
def get_user_email(user):
    return user.email  # crashes if user is None

# RIGHT
def get_user_email(user):
    if user is None:
        return None
    return user.email

# Or use Optional typing
def get_user_email(user: Optional[User]) -> Optional[str]:
    return user.email if user else None
```

### 14.3 Mutable Default Arguments (Python)

```python
# WRONG (default list is shared across calls!)
def add_item(item, items=[]):
    items.append(item)
    return items

print(add_item(1))  # [1]
print(add_item(2))  # [1, 2] — not [2]!

# RIGHT
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

### 14.4 Floating Point Comparison

```python
# WRONG
if 0.1 + 0.2 == 0.3:
    print("equal")  # never prints! 0.1 + 0.2 = 0.30000000000000004

# RIGHT
from math import isclose
if isclose(0.1 + 0.2, 0.3):
    print("equal")

# Or use Decimal for money
from decimal import Decimal
if Decimal("0.1") + Decimal("0.2") == Decimal("0.3"):
    print("equal")
```

### 14.5 Timezone Bugs

```python
# WRONG (naive datetime — interpreted as local time, ambiguous)
import datetime
dt = datetime.datetime.now()  # what timezone??

# RIGHT
from datetime import datetime, timezone
dt = datetime.now(timezone.utc)  # explicit UTC

# Or use a library
import pendulum
dt = pendulum.now("UTC")
```

### 14.6 Race Conditions

```python
# WRONG (check-then-act is not atomic)
if not file_exists(path):
    write_file(path)  # another process might create it between check and write

# RIGHT (atomic operation)
try:
    write_file_exclusive(path)  # fails if exists
except FileExistsError:
    pass  # already exists, that's fine
```

### 14.7 SQL Injection (covered in Security)

```python
# WRONG
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")

# RIGHT
cursor.execute("SELECT * FROM users WHERE name = %s", (name,))
```

### 14.8 Resource Leaks

```python
# WRONG (file handle leaks on exception)
f = open("data.txt")
data = f.read()
process(data)  # if this throws, f is never closed
f.close()

# RIGHT
with open("data.txt") as f:
    data = f.read()
process(data)  # f is closed even if this throws
```

### 14.9 Unhandled Promise Rejection (JavaScript)

```javascript
// WRONG (rejection is silent)
async function getData() {
  const response = await fetch("/api/data");
  return response.json();
}
getData();  // if it rejects, no catch, no log

// RIGHT
getData().catch(error => {
  console.error("getData failed:", error);
});

// Or with await:
try {
  const data = await getData();
} catch (error) {
  console.error("getData failed:", error);
}
```

### 14.10 Insecure Deserialization

```python
# WRONG (pickle can execute arbitrary code)
import pickle
data = pickle.loads(request.body)  # if attacker controls body, they own your server

# RIGHT (use safe formats)
import json
data = json.loads(request.body)
```

### 14.11 HTTP Header Injection

```python
# WRONG
redirect_url = request.args.get("next")
response.headers["Location"] = redirect_url  # attacker can inject \r\n and add headers

# RIGHT (validate URL)
from urllib.parse import urlparse
parsed = urlparse(redirect_url)
if not parsed.netloc:  # only allow relative URLs
    response.headers["Location"] = redirect_url
else:
    response.headers["Location"] = "/"
```

### 14.12 Regular Expression DoS

```python
# WRONG (catastrophic backtracking on long input)
import re
pattern = re.compile(r"^(a+)+$")
pattern.match("a" * 30 + "!")  # hangs for minutes

# RIGHT (use safe patterns, test with long inputs)
pattern = re.compile(r"^a+$")
pattern.match("a" * 30 + "!")  # instant
```

### 14.13 Mutable State in Closures

```javascript
// WRONG (all closures share same i)
const funcs = [];
for (var i = 0; i < 3; i++) {
  funcs.push(() => console.log(i));
}
funcs.forEach(f => f());  // prints 3, 3, 3

// RIGHT (let creates new binding per iteration)
const funcs = [];
for (let i = 0; i < 3; i++) {
  funcs.push(() => console.log(i));
}
funcs.forEach(f => f());  // prints 0, 1, 2
```

### 14.14 Implicit Type Coercion (JavaScript)

```javascript
// Surprising results:
1 + "1" === "11"  // true
1 - "1" === 0     // true
[] == false       // true
"" == 0           // true
null == undefined // true

// Always use ===
if (value === expected) { ... }
```

### 14.15 Hash Collision DoS

If user input becomes hash keys, an attacker can craft keys that all hash to the same bucket, causing O(n²) performance:

```python
# Some languages (Python 3.3+) randomize hash seed per process, mitigating this
# But if you serialize/deserialize hashes, be careful

# For query string parsing in some frameworks, limit the number of parameters
```

---

## 15. Reusable Code Patterns

### 15.1 The Null Check Helper

```python
def safe_get(obj, path, default=None):
    """
    Safely traverse nested objects.
    
    >>> safe_get({"a": {"b": {"c": 1}}}, "a.b.c")
    1
    >>> safe_get({"a": {}}, "a.b.c", default="missing")
    "missing"
    """
    try:
        for key in path.split('.'):
            obj = obj[key]
        return obj
    except (KeyError, TypeError, IndexError):
        return default
```

### 15.2 The Retry Helper

```python
import time
from typing import Callable, TypeVar, Tuple, Type

T = TypeVar('T')

def with_retry(
    func: Callable[[], T],
    retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,)
) -> T:
    """
    Retry a function with exponential backoff.
    
    Args:
        func: The function to call.
        retries: Max number of retries (not including initial attempt).
        delay: Initial delay between retries in seconds.
        backoff: Multiplier applied to delay after each retry.
        exceptions: Tuple of exception types to retry on.
    
    Returns:
        The result of func().
    
    Raises:
        The last exception if all retries fail.
    """
    last_exception = None
    for attempt in range(retries + 1):
        try:
            return func()
        except exceptions as e:
            last_exception = e
            if attempt == retries:
                raise
            sleep_time = delay * (backoff ** attempt)
            time.sleep(sleep_time)
    raise last_exception  # unreachable, but satisfies type checker
```

### 15.3 The Circuit Breaker

```python
import time
from enum import Enum
from typing import Callable, TypeVar

T = TypeVar('T')

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitOpenError(Exception):
    pass

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout: float = 60.0,
        half_open_max_calls: int = 1
    ):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.half_open_max_calls = half_open_max_calls
        self.state = CircuitState.CLOSED
        self.failures = 0
        self.last_failure_time = 0
        self.half_open_calls = 0
    
    def call(self, func: Callable[[], T]) -> T:
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.reset_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
            else:
                raise CircuitOpenError("Circuit is open")
        
        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls >= self.half_open_max_calls:
                raise CircuitOpenError("Half-open call limit reached")
            self.half_open_calls += 1
        
        try:
            result = func()
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        self.failures = 0
        self.state = CircuitState.CLOSED
    
    def _on_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        if self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
```

### 15.4 The Result Type (Python)

```python
from typing import TypeVar, Generic, Optional, Callable
from dataclasses import dataclass

T = TypeVar('T')
E = TypeVar('E')

@dataclass
class Result(Generic[T]):
    """A Result type that explicitly represents success or failure."""
    value: Optional[T] = None
    error: Optional[str] = None
    
    @property
    def is_success(self) -> bool:
        return self.error is None
    
    @property
    def is_failure(self) -> bool:
        return self.error is not None
    
    def unwrap(self) -> T:
        if self.is_failure:
            raise ValueError(f"Called unwrap on failure: {self.error}")
        return self.value
    
    def unwrap_or(self, default: T) -> T:
        return self.value if self.is_success else default
    
    def map(self, func: Callable[[T], T]) -> 'Result[T]':
        if self.is_success:
            return Result(value=func(self.value))
        return self
    
    @staticmethod
    def ok(value: T) -> 'Result[T]':
        return Result(value=value)
    
    @staticmethod
    def fail(error: str) -> 'Result[T]':
        return Result(error=error)

# Usage:
def parse_int(s: str) -> Result[int]:
    try:
        return Result.ok(int(s))
    except ValueError:
        return Result.fail(f"Cannot parse '{s}' as int")

result = parse_int("42").map(lambda x: x * 2)
if result.is_success:
    print(result.unwrap())  # 84
```

### 15.5 The Repository Interface

```python
from abc import ABC, abstractmethod
from typing import Optional, List, Generic, TypeVar
from dataclasses import dataclass

T = TypeVar('T')
ID = TypeVar('ID')

class Repository(ABC, Generic[T, ID]):
    """Abstract repository — implement for each entity."""
    
    @abstractmethod
    def find_by_id(self, id: ID) -> Optional[T]:
        ...
    
    @abstractmethod
    def find_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        ...
    
    @abstractmethod
    def save(self, entity: T) -> T:
        ...
    
    @abstractmethod
    def delete(self, id: ID) -> bool:
        ...
    
    @abstractmethod
    def exists(self, id: ID) -> bool:
        ...

# Concrete implementation
class PostgresUserRepository(Repository[User, int]):
    def __init__(self, db):
        self.db = db
    
    def find_by_id(self, id: int) -> Optional[User]:
        row = self.db.query_one(
            "SELECT id, email, name FROM users WHERE id = %s",
            (id,)
        )
        if not row:
            return None
        return User(id=row['id'], email=row['email'], name=row['name'])
    
    # ... implement other methods
```

### 15.6 The Configuration Loader

```python
import os
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class Config:
    """Application configuration loaded from environment."""
    database_url: str
    database_pool_size: int
    redis_url: str
    secret_key: str
    log_level: str
    environment: str  # 'dev', 'staging', 'prod'
    
    @staticmethod
    def from_env() -> 'Config':
        """Load config from environment variables. Fails fast on missing required vars."""
        return Config(
            database_url=_required('DATABASE_URL'),
            database_pool_size=_int_env('DATABASE_POOL_SIZE', default=10),
            redis_url=_required('REDIS_URL'),
            secret_key=_required('SECRET_KEY'),
            log_level=os.getenv('LOG_LEVEL', 'INFO'),
            environment=_required('ENVIRONMENT'),
        )
    
    @property
    def is_production(self) -> bool:
        return self.environment == 'prod'

def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value

def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        raise RuntimeError(f"Environment variable {name} must be an integer, got: {value}")
```

### 15.7 The Background Job Processor

```python
import asyncio
from typing import Callable, TypeVar, List
from dataclasses import dataclass, field
from datetime import datetime

T = TypeVar('T')

@dataclass
class Job:
    id: str
    handler: Callable
    payload: dict
    created_at: datetime = field(default_factory=datetime.utcnow)
    attempts: int = 0
    max_attempts: int = 3

class JobProcessor:
    def __init__(self, max_concurrency: int = 5):
        self.max_concurrency = max_concurrency
        self.queue: asyncio.Queue[Job] = asyncio.Queue()
        self.workers: List[asyncio.Task] = []
    
    async def start(self):
        """Start the worker pool."""
        for _ in range(self.max_concurrency):
            worker = asyncio.create_task(self._worker())
            self.workers.append(worker)
    
    async def stop(self):
        """Gracefully stop workers."""
        await self.queue.join()  # wait for pending jobs
        for worker in self.workers:
            worker.cancel()
    
    async def enqueue(self, job: Job):
        await self.queue.put(job)
    
    async def _worker(self):
        while True:
            job = await self.queue.get()
            try:
                await self._process_job(job)
            except Exception as e:
                job.attempts += 1
                if job.attempts < job.max_attempts:
                    await self.queue.put(job)  # retry
                else:
                    # log failure, send to dead letter queue
                    pass
            finally:
                self.queue.task_done()
    
    async def _process_job(self, job: Job):
        await job.handler(job.payload)
```

---

## 16. Pre-Flight Checklist

Before declaring code "done," verify EVERY item:

### 16.1 Functionality
- [ ] All acceptance criteria met
- [ ] Happy path tested manually
- [ ] Edge cases tested (empty, null, max, min, invalid)
- [ ] Error cases tested
- [ ] No crashes on any input

### 16.2 Code Quality
- [ ] Functions <50 lines
- [ ] Nesting depth ≤3
- [ ] No magic numbers/strings
- [ ] No dead code
- [ ] No commented-out code
- [ ] Descriptive names everywhere
- [ ] Type hints on all functions
- [ ] Docstrings on public APIs

### 16.3 Error Handling
- [ ] All external calls wrapped in try/catch
- [ ] Specific exception types (not generic `Exception`)
- [ ] Resources cleaned up (files closed, connections released)
- [ ] No silent failures (no bare `except: pass`)
- [ ] Errors logged with context

### 16.4 Security
- [ ] Input validated at boundaries
- [ ] SQL parameterized
- [ ] Output escaped for XSS
- [ ] Auth + authz on every endpoint
- [ ] No secrets in code/logs
- [ ] Rate limiting on public endpoints
- [ ] HTTPS enforced

### 16.5 Performance
- [ ] No N+1 queries
- [ ] Pagination on list endpoints
- [ ] No unbounded loops on user input
- [ ] Expensive operations cached
- [ ] Async I/O for concurrent operations
- [ ] Database indexes verified

### 16.6 Testing
- [ ] Unit tests for all logic
- [ ] Integration tests for critical paths
- [ ] Edge cases covered
- [ ] Tests are fast (<1s each)
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests don't depend on order
- [ ] Coverage >80% on critical paths

### 16.7 Documentation
- [ ] README updated (if applicable)
- [ ] Public APIs documented
- [ ] Comments explain WHY, not WHAT
- [ ] ADR written for significant decisions
- [ ] Changelog updated

### 16.8 Style
- [ ] Linter passes (no warnings)
- [ ] Formatter run (consistent style)
- [ ] Consistent with codebase conventions
- [ ] No `console.log` / `print` in production code

### 16.9 Dependencies
- [ ] New dependencies justified
- [ ] Versions pinned
- [ ] Licenses compatible
- [ ] No known vulnerabilities (`npm audit`, `pip-audit`)

### 16.10 Deployment
- [ ] Migrations written and tested
- [ ] Config documented
- [ ] Rollback plan exists
- [ ] Feature flags for risky changes
- [ ] Monitoring + alerting configured

---

## 17. Testing Protocol

### 17.1 Test Pyramid Implementation

For every feature:

1. **Write unit tests first** (TDD or just-after):
   - Test the function in isolation
   - Mock all external dependencies
   - Cover happy path + edge cases + errors
   - Should run in <100ms total

2. **Write integration tests**:
   - Test function + its real dependencies (DB, APIs)
   - Use test database / sandbox APIs
   - Slower but more realistic
   - Should run in <10s total

3. **Write E2E tests for critical paths**:
   - Test the full system as a user would
   - Only for signup, payment, key flows
   - Slow, but catches integration bugs
   - Should run in <60s total

### 17.2 Test Data Management

```python
# Use factories (not manual construction)
import factory

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    id = factory.Sequence(lambda n: n)
    email = factory.LazyAttribute(lambda obj: f"user{obj.id}@test.com")
    name = "Test User"
    role = "user"
    active = True

# In tests:
def test_user_can_login():
    user = UserFactory.build()  # in-memory, not saved
    assert login(user.email, "password") is True

def test_inactive_user_cannot_login():
    user = UserFactory.build(active=False)
    assert login(user.email, "password") is False
```

### 17.3 Test Isolation

Each test must:
- Set up its own state (don't depend on previous tests)
- Clean up after itself (use fixtures with teardown)
- Not depend on external state (network, system clock, file system)
- Be runnable in any order

```python
import pytest
from datetime import datetime

@pytest.fixture
def mock_now(monkeypatch):
    """Freeze time for tests."""
    fixed_time = datetime(2025, 1, 1, 12, 0, 0)
    class MockDatetime:
        @classmethod
        def now(cls, tz=None):
            return fixed_time
    monkeypatch.setattr("myapp.datetime", MockDatetime)
    return fixed_time

def test_created_at_uses_current_time(mock_now):
    user = create_user("test@example.com")
    assert user.created_at == mock_now
```

### 17.4 Property-Based Testing

For functions with many input combinations:

```python
from hypothesis import given, strategies as st, settings

@given(st.text(min_size=1, max_size=100))
def test_encode_decode_roundtrip(text):
    """Encoding then decoding should return original text."""
    encoded = encode(text)
    decoded = decode(encoded)
    assert decoded == text

@given(st.lists(st.integers()))
@settings(max_examples=200)
def test_sort_is_idempotent(lst):
    """Sorting twice should give same result as sorting once."""
    assert sort(sort(lst)) == sort(lst)
```

### 17.5 Mutation Testing

Verify your tests actually catch bugs:

```bash
# Python: mutmut
mutmut run --paths-to-mutate src/

# JavaScript: stryker
npx stryker run
```

These tools mutate your code (change `+` to `-`, `>` to `>=`, etc.) and check if tests catch the mutation. If they don't, your tests are insufficient.

### 17.6 Load Testing

For APIs, simulate real load:

```python
# Using locust
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 5)
    
    @task
    def get_users(self):
        self.client.get("/api/users")
    
    @task(3)  # 3x more frequent
    def create_user(self):
        self.client.post("/api/users", json={"email": "test@example.com"})
```

Run with 1000 virtual users, measure latency percentiles (p50, p95, p99).

---

## 18. AI Agent Meta-Rules

Rules for the AI agent itself, not the code it writes.

### 18.1 Understand Before Coding

Before writing any code:
1. Read the existing codebase (don't assume)
2. Understand the architecture and conventions
3. Identify the patterns already in use
4. Match the existing style, even if you prefer another

**Bad:** "I'll rewrite this in my preferred pattern."

**Good:** "I'll match the existing pattern, even if I think there's a better way."

### 18.2 Ask Clarifying Questions

If the request is ambiguous, ask. Don't guess. Possible ambiguities:
- "Add a login feature" — what auth method? Email/password? OAuth? Both?
- "Make it faster" — what's the current performance? What's the target?
- "Fix the bug" — what bug? Where? What are the steps to reproduce?

5 minutes of questions saves 5 hours of rework.

### 18.3 Don't Reinvent the Wheel

Before implementing anything:
1. Check if the language's standard library has it
2. Check if a popular, maintained library does it
3. Check if the existing codebase has a utility for it

Only hand-roll if all three fail. Even then, consider whether the feature is needed.

### 18.4 Show Your Reasoning

For non-trivial decisions, explain WHY:

```python
# Using a dict instead of a list here because we need O(1) lookups by user_id.
# Memory is a non-issue (max ~10k users), so the dict's overhead is acceptable.
users_by_id = {u.id: u for u in users}
```

This helps reviewers understand your thinking and catch logic errors.

### 18.5 Test Your Own Code

Before declaring done:
1. Mentally trace through the code with sample inputs
2. Identify edge cases
3. Write tests for those edge cases
4. Run the tests (or trace them mentally if you can't run)
5. Fix any bugs you find

Don't deliver untested code.

### 18.6 Don't Over-Engineer

Resist the urge to add:
- Config systems for hypothetical future needs
- Plugin architectures with no plugins
- Abstractions with one implementation
- "Just in case" features

Build what's needed now. Make the code extensible, but don't pre-build extensions.

### 18.7 Admit Uncertainty

If you don't know:
- The best library for a task
- How a particular API behaves
- Whether an approach will perform well
- The security implications of a design

Say so. Recommend the user research it, or offer multiple options with tradeoffs.

**Bad:** "This is definitely the best approach."

**Good:** "I believe this is a good approach, but I haven't benchmarked it. Here are the alternatives..."

### 18.8 Match the Codebase's Complexity

If the codebase is simple, write simple code. Don't introduce factories, strategies, and repositories into a 500-line script. Match the existing level of abstraction.

### 18.9 Don't Break Existing Tests

If your change breaks existing tests:
1. The tests are wrong → fix the tests, explain why
2. The tests are right → your change is wrong, fix your change

Never disable or delete tests to make your change pass. That's a red flag.

### 18.10 Leave the Codebase Better

When you finish a task:
1. Run the linter, fix warnings
2. Remove dead code you noticed
3. Fix typos in comments
4. Improve unclear names you encountered
5. Update documentation that's now stale

These small improvements compound. The codebase gets better with every change.

### 18.11 When in Doubt, Be Explicit

Ambiguity is the enemy. If there are multiple ways to interpret a requirement, choose the explicit one:
- "Cache this" → cache with TTL=300s, not "cache forever"
- "Log this error" → log at ERROR level with full context, not "log something"
- "Validate input" → validate with specific schema, not "check if it looks right"

### 18.12 Don't Add Comments That Will Go Stale

```python
# BAD (will go stale when code changes):
# This calls the Stripe API to charge the customer
stripe.charge(customer_id, amount)

# GOOD (explains WHY, won't go stale):
# We use Stripe's legacy charge API because our accounting system
# depends on the charge ID format. Migrating to PaymentIntents
# is tracked in ticket #1234.
stripe.charge(customer_id, amount)
```

### 18.13 Final Rule: Optimize for the Reader

Code is read 10x more than it is written. Optimize for the next person who reads it:
- Clear names over clever abbreviations
- Explicit logic over implicit magic
- Simple solutions over clever ones
- Comments that explain context over comments that restate code
- Tests that document behavior over tests that just cover lines

If a junior dev can't understand your code in 5 minutes, it's too clever. Refactor it.

---

## Final Note to the Agent Reading This

If you are an AI agent writing code: **read this entire document before writing any code.** Every rule here exists because real code failed in production without it.

The mark of "Claude Opus-level" code is not complexity — it's the absence of bugs. A simple solution that works beats a clever solution that almost works. Optimize for the user's time, not for showing off your knowledge of obscure language features.

When in doubt:
1. Simpler over cleverer
2. Explicit over implicit
3. Defensive over optimistic
4. Tested over untested
5. Documented over undocumented
6. Honest about uncertainty over confidently wrong

Write code you'd be proud to maintain at 3 AM. Write code that, if you disappeared tomorrow, the next dev could understand and extend. Write code that solves the problem today without locking in bad decisions for tomorrow.

That's the standard. Meet it.
