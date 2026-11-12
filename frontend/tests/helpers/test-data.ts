import { faker } from '@faker-js/faker';
import { createTestRecord } from './mongodb';

/**
 * Generate a test user
 */
export function generateTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestRecord({
    username: `test_${faker.internet.username().toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    email: `test_${faker.internet.email().toLowerCase()}`,
    password: 'Test1234!',
    role: 'Staff',
    isActive: true,
    ...overrides,
  }, 'user');
}

/**
 * Generate a test admin user
 */
export function generateTestAdmin(overrides: Partial<TestUser> = {}): TestUser {
  return generateTestUser({
    role: 'Admin',
    ...overrides,
  });
}

/**
 * Generate a test book
 */
export function generateTestBook(overrides: Partial<TestBook> = {}): TestBook {
  const isbn = `TEST-${faker.string.numeric(13)}`;
  return createTestRecord({
    ISBN: isbn,
    TITLE: `Test Book ${faker.lorem.words(3)}`,
    AUTHOR: faker.person.fullName(),
    SUBJECT: faker.lorem.word(),
    EDITION: '1st',
    YEAR: faker.number.int({ min: 2000, max: 2024 }).toString(),
    PUBLISHER: faker.company.name(),
    BIND: 'Paperback',
    QTY: faker.number.int({ min: 0, max: 100 }),
    PRICE: parseFloat(faker.commerce.price({ min: 10, max: 200 })),
    MIN_QTY: 5,
    isArchived: false,
    ...overrides,
  }, 'book');
}

/**
 * Generate a test customer
 */
export function generateTestCustomer(overrides: Partial<TestCustomer> = {}): TestCustomer {
  return createTestRecord({
    name: faker.company.name(),
    contactPerson: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    zipCode: faker.location.zipCode(),
    country: 'USA',
    creditLimit: faker.number.float({ min: 1000, max: 100000, fractionDigits: 2 }),
    isActive: true,
    ...overrides,
  }, 'customer');
}

/**
 * Generate a test marketing executive
 */
export function generateTestMarketingExecutive(overrides: Partial<TestMarketingExecutive> = {}): TestMarketingExecutive {
  return createTestRecord({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    region: faker.location.state(),
    isActive: true,
    ...overrides,
  }, 'me');
}

/**
 * Generate test stock transaction
 */
export function generateTestStockTransaction(
  isbn: string,
  overrides: Partial<TestStockTransaction> = {}
): TestStockTransaction {
  const qtyChanged = faker.number.int({ min: -10, max: 10 }) || 1;
  return createTestRecord({
    ISBN: isbn,
    action: qtyChanged > 0 ? 'INBOUND' : 'OUTBOUND',
    qtyChanged,
    previousQty: faker.number.int({ min: 0, max: 50 }),
    newQty: 0, // Will be calculated
    performedBy: 'test_user_id',
    notes: faker.lorem.sentence(),
    ...overrides,
  }, 'txn');
}

/**
 * Generate test reservation
 */
export function generateTestReservation(
  isbn: string,
  customerId: string,
  overrides: Partial<TestReservation> = {}
): TestReservation {
  return createTestRecord({
    ISBN: isbn,
    customerId,
    qty: faker.number.int({ min: 1, max: 10 }),
    status: 'PENDING',
    notes: faker.lorem.sentence(),
    ...overrides,
  }, 'res');
}

/**
 * Generate test delivery receipt
 */
export function generateTestDeliveryReceipt(
  customerId: string,
  items: Array<{ isbn: string; qty: number; price: number }>,
  overrides: Partial<TestDeliveryReceipt> = {}
): TestDeliveryReceipt {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const tax = subtotal * 0.1; // 10% tax
  return createTestRecord({
    drNumber: `DR-TEST-${Date.now()}`,
    customerId,
    items: items.map(item => ({
      isbn: item.isbn,
      qty: item.qty,
      price: item.price,
      total: item.qty * item.price,
    })),
    subtotal,
    tax,
    total: subtotal + tax,
    status: 'DRAFT',
    notes: faker.lorem.sentence(),
    ...overrides,
  }, 'dr');
}

/**
 * Generate test sales invoice
 */
export function generateTestSalesInvoice(
  customerId: string,
  items: Array<{ isbn: string; qty: number; price: number }>,
  overrides: Partial<TestSalesInvoice> = {}
): TestSalesInvoice {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const tax = subtotal * 0.1;
  return createTestRecord({
    siNumber: `SI-TEST-${Date.now()}`,
    customerId,
    items: items.map(item => ({
      isbn: item.isbn,
      qty: item.qty,
      price: item.price,
      total: item.qty * item.price,
    })),
    subtotal,
    tax,
    total: subtotal + tax,
    status: 'DRAFT',
    notes: faker.lorem.sentence(),
    ...overrides,
  }, 'si');
}

/**
 * Generate test evaluation form
 */
export function generateTestEvaluationForm(
  marketingExecutiveId: string,
  overrides: Partial<TestEvaluationForm> = {}
): TestEvaluationForm {
  return createTestRecord({
    efNumber: `EF-TEST-${Date.now()}`,
    marketingExecutiveId,
    periodStart: faker.date.past({ years: 1 }).toISOString().split('T')[0],
    periodEnd: faker.date.recent({ days: 30 }).toISOString().split('T')[0],
    metrics: {
      visits: faker.number.int({ min: 0, max: 50 }),
      calls: faker.number.int({ min: 0, max: 100 }),
      orders: faker.number.int({ min: 0, max: 20 }),
      revenue: faker.number.float({ min: 0, max: 100000, fractionDigits: 2 }),
    },
    notes: faker.lorem.paragraph(),
    status: 'DRAFT',
    ...overrides,
  }, 'ef');
}

// Type definitions
export interface TestUser {
  _testId: string;
  username: string;
  email: string;
  password: string;
  role: 'Admin' | 'Staff';
  isActive: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
}

export interface TestBook {
  _testId: string;
  ISBN: string;
  TITLE: string;
  AUTHOR: string;
  SUBJECT: string;
  EDITION: string;
  YEAR: string;
  PUBLISHER: string;
  BIND: string;
  QTY: number;
  PRICE: number;
  MIN_QTY: number;
  isArchived: boolean;
}

export interface TestCustomer {
  _testId: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  creditLimit: number;
  isActive: boolean;
}

export interface TestMarketingExecutive {
  _testId: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  isActive: boolean;
}

export interface TestStockTransaction {
  _testId: string;
  ISBN: string;
  action: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT' | 'RETURN' | 'RESERVATION' | 'RELEASE';
  qtyChanged: number;
  previousQty: number;
  newQty: number;
  performedBy: string;
  notes?: string;
}

export interface TestReservation {
  _testId: string;
  ISBN: string;
  customerId: string;
  qty: number;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
  notes?: string;
}

export interface TestDeliveryReceipt {
  _testId: string;
  drNumber: string;
  customerId: string;
  items: Array<{ isbn: string; qty: number; price: number; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  notes?: string;
}

export interface TestSalesInvoice {
  _testId: string;
  siNumber: string;
  customerId: string;
  items: Array<{ isbn: string; qty: number; price: number; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  notes?: string;
}

export interface TestEvaluationForm {
  _testId: string;
  efNumber: string;
  marketingExecutiveId: string;
  periodStart: string;
  periodEnd: string;
  metrics: {
    visits: number;
    calls: number;
    orders: number;
    revenue: number;
  };
  notes?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
}