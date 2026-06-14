import { validateCandidateData } from '../application/validator';
import { addCandidate } from '../application/services/candidateService';
import { PrismaClient } from '@prisma/client';

// --- Prisma mock ---
// The domain models create a real PrismaClient at import time, so we replace the
// whole '@prisma/client' module with a fake one. The spies live INSIDE the factory
// because jest.mock is hoisted above any outer variable, which would otherwise be
// undefined when the factory runs. We read them back through the mocked client below.
jest.mock('@prisma/client', () => {
  const candidate = { create: jest.fn() };
  const education = { create: jest.fn() };
  const workExperience = { create: jest.fn() };
  const resume = { create: jest.fn() };

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      candidate,
      education,
      workExperience,
      resume,
    })),
    // Keep the Prisma namespace so `error instanceof Prisma.PrismaClientInitializationError`
    // in the model does not blow up. A dummy class is enough for our tests.
    Prisma: {
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
    },
  };
});

// Recover the candidate spy from the mocked client so tests can configure and
// assert it. new PrismaClient() returns the same singleton object the models hold
// internally, so this is the exact function the code under test calls.
const prismaMock = new PrismaClient() as any;
const mockCandidateCreate = prismaMock.candidate.create as jest.Mock;

// A valid candidate used as a baseline. Each test overrides only the field
// it wants to exercise, so the reason a test fails is obvious at a glance.
const buildValidCandidate = (overrides: Record<string, any> = {}) => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '612345678',
  address: 'Calle Mayor 1',
  educations: [
    {
      institution: 'University of London',
      title: 'Mathematics',
      startDate: '1832-01-01',
      endDate: '1835-01-01',
    },
  ],
  workExperiences: [
    {
      company: 'Analytical Engine',
      position: 'Programmer',
      description: 'First algorithm',
      startDate: '1843-01-01',
    },
  ],
  cv: {
    filePath: '/uploads/ada.pdf',
    fileType: 'application/pdf',
  },
  ...overrides,
});

describe('validateCandidateData - form data reception', () => {

  // --- Happy path ---

  it('does not throw when the candidate has all valid data', () => {
    // Arrange
    const validCandidate = buildValidCandidate();

    // Act + Assert
    expect(() => validateCandidateData(validCandidate)).not.toThrow();
  });

  it('does not throw when only mandatory fields are provided', () => {
    // Arrange: just the required fields, no optional data
    const minimalCandidate = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    };

    // Act + Assert
    expect(() => validateCandidateData(minimalCandidate)).not.toThrow();
  });

  // --- Validation errors (parameterized) ---

  describe('throws when a field is invalid', () => {
    test.each([
      { case: 'invalid email format', override: { email: 'not-an-email' }, message: 'Invalid email' },
      { case: 'first name too short', override: { firstName: 'A' }, message: 'Invalid name' },
      { case: 'first name with numbers', override: { firstName: 'Ada123' }, message: 'Invalid name' },
      { case: 'phone not starting with 6/7/9', override: { phone: '123456789' }, message: 'Invalid phone' },
      {
        case: 'education date in wrong format',
        override: { educations: [{ institution: 'MIT', title: 'CS', startDate: '01-01-2020' }] },
        message: 'Invalid date',
      },
      {
        case: 'cv without filePath',
        override: { cv: { fileType: 'application/pdf' } },
        message: 'Invalid CV data',
      },
    ])('throws on $case with message "$message"', ({ override, message }) => {
      // Arrange: a valid candidate with a single broken field
      const candidate = buildValidCandidate(override);

      // Act + Assert
      expect(() => validateCandidateData(candidate)).toThrow(message);
    });
  });

  // --- Documented edge case: the `id` shortcut ---

  it('skips all validation when an id is provided (treated as an edit)', () => {
    // Arrange: completely invalid data, but with an id present
    const editPayload = {
      id: 42,
      firstName: '',
      email: 'totally-invalid',
    };

    // Act + Assert: having an id bypasses every validation rule
    expect(() => validateCandidateData(editPayload)).not.toThrow();
  });

});

describe('addCandidate - saving to the database', () => {

  beforeEach(() => {
    // Reset every spy so calls from one test do not leak into the next.
    jest.clearAllMocks();
  });

  it('saves a valid candidate and returns it with the generated id', async () => {
    // Arrange: the candidate Prisma will "persist" (with a generated id)
    const savedCandidate = { id: 1, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
    mockCandidateCreate.mockResolvedValue(savedCandidate);

    // Act: only mandatory fields, so Prisma is called exactly once (the candidate)
    const result = await addCandidate({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });

    // Assert
    expect(mockCandidateCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(savedCandidate);
  });

  it('passes the candidate fields to Prisma', async () => {
    // Arrange
    mockCandidateCreate.mockResolvedValue({ id: 2 });

    // Act
    await addCandidate({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
    });

    // Assert: Prisma received the expected data under the `data` key
    expect(mockCandidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@example.com',
        }),
      }),
    );
  });

  it('throws a friendly error when the email already exists (P2002)', async () => {
    // Arrange: Prisma rejects with a unique-constraint violation
    const uniqueError: any = new Error('Unique constraint failed');
    uniqueError.code = 'P2002';
    mockCandidateCreate.mockRejectedValue(uniqueError);

    // Act + Assert
    await expect(
      addCandidate({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
    ).rejects.toThrow('The email already exists in the database');
  });

  it('does not touch the database when the data is invalid', async () => {
    // Act + Assert: validation fails first, so the flow never reaches Prisma
    await expect(
      addCandidate({ firstName: 'Ada', lastName: 'Lovelace', email: 'not-an-email' }),
    ).rejects.toThrow();

    expect(mockCandidateCreate).not.toHaveBeenCalled();
  });

});
