'use strict';

const FIXED_NOW = new Date('2026-06-05T12:00:00.000Z');
const ORIGINAL_ENV = process.env;

const buildReport = ({ id, updatedAt, session }) => ({
  id,
  created_at: updatedAt,
  updated_at: updatedAt,
  session
});

const expectInfoLogs = (logger, calls) => {
  expect(logger.info.mock.calls).toEqual(calls);
};

const loadSubject = ({
  reports = [],
  selectResult,
  sendEmailImpl,
  updateResult = 1,
  deleteResult = 1
} = {}) => {
  jest.resetModules();

  process.env = {
    ...ORIGINAL_ENV,
    NOTIFY_KEY: 'notify-key',
    TIMEOUT_TEMPLATE: 'timeout-template',
    SAVE_REPORT_TEMPLATE: 'save-template',
    SOON_TO_BE_DELETED_TEMPLATE: 'soon-template',
    DELETE_TEMPLATE: 'delete-template',
    APP_URL: 'https://app.example.test',
    SESSION_TTL: '3600',
    FIRST_ALERT_TIMEOUT: '21',
    DELETION_TIMEOUT: '28'
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  const sendEmail = jest.fn(sendEmailImpl || (() => Promise.resolve()));
  const update = jest.fn().mockResolvedValue(updateResult);
  const del = jest.fn().mockResolvedValue(deleteResult);
  const setIntervalMock = jest
    .spyOn(global, 'setInterval')
    .mockImplementation(() => 1);
  const processOnMock = jest
    .spyOn(process, 'on')
    .mockImplementation(() => process);
  const where = jest.fn(() => ({ update, del }));
  const tableCall = jest.fn(() => ({ where }));
  const from = jest.fn().mockResolvedValue(reports);
  const select = jest.fn(() => ({ from: selectResult || from }));
  const destroy = jest.fn().mockResolvedValue();
  const db = Object.assign(tableCall, { select, destroy });
  const knex = jest.fn(() => db);

  jest.doMock('node-json-logger', () => jest.fn(() => logger));
  jest.doMock('notifications-node-client', () => ({
    NotifyClient: jest.fn(() => ({ sendEmail }))
  }));
  jest.doMock('knex', () => ({ knex }));
  jest.doMock('ms-schema', () => ({ development: {}, production: {} }));

  const subject = require('../../alerts');

  return {
    processAlerts: subject.processAlerts,
    logger,
    sendEmail,
    update,
    del,
    where,
    db,
    knex,
    setIntervalMock,
    processOnMock
  };
};

describe('alerts/index', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('should send a save report email and update the session when alertUser is true', async () => {
    const report = buildReport({
      id: 1,
      updatedAt: '2026-06-05T10:00:00.000Z',
      session: {
        'user-email': 'caseworker@example.com',
        reference: 'ABC123',
        alertUser: true
      }
    });

    const { processAlerts, logger, sendEmail, where, update, del } =
      loadSubject({
        reports: [report]
      });

    await processAlerts();

    expect(sendEmail).toHaveBeenCalledWith(
      'save-template',
      'caseworker@example.com',
      expect.objectContaining({
        personalisation: expect.objectContaining({
          reference: 'ABC123',
          url: 'https://app.example.test'
        })
      })
    );
    expect(where).toHaveBeenCalledWith({ id: 1 });
    expect(update).toHaveBeenCalledWith({
      session: expect.objectContaining({
        alertUser: false,
        reference: 'ABC123'
      })
    });
    expect(del).not.toHaveBeenCalled();
    expectInfoLogs(logger, [
      ['Processed report', { id: 1 }],
      ['Updating report session', { id: 1 }],
      ['Report session updated', { id: 1 }]
    ]);
  });

  test('should send a timeout email for an expired session with no alert flag', async () => {
    const report = buildReport({
      id: 2,
      updatedAt: '2026-06-05T10:59:00.000Z',
      session: {
        'user-email': 'timeout@example.com',
        reference: 'TIMEOUT-1'
      }
    });

    const { processAlerts, logger, sendEmail, update } = loadSubject({
      reports: [report]
    });

    await processAlerts();

    expect(sendEmail).toHaveBeenCalledWith(
      'timeout-template',
      'timeout@example.com',
      expect.objectContaining({
        personalisation: expect.objectContaining({
          reference: 'TIMEOUT-1'
        })
      })
    );
    expect(update).toHaveBeenCalledWith({
      session: expect.objectContaining({
        alertUser: false,
        reference: 'TIMEOUT-1'
      })
    });
    expectInfoLogs(logger, [
      ['Processed report', { id: 2 }],
      ['Updating report session', { id: 2 }],
      ['Report session updated', { id: 2 }]
    ]);
  });

  test('should send a deletion email and delete the report when it is past the deletion timeout', async () => {
    const report = buildReport({
      id: 3,
      updatedAt: '2026-05-07T11:59:00.000Z',
      session: {
        'user-email': 'delete@example.com',
        reference: 'DELETE-1',
        alertUser: false
      }
    });

    const { processAlerts, logger, sendEmail, update, del } = loadSubject({
      reports: [report]
    });

    await processAlerts();

    expect(sendEmail).toHaveBeenCalledWith(
      'delete-template',
      'delete@example.com',
      expect.any(Object)
    );
    expect(del).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expectInfoLogs(logger, []);
  });

  test('should send a first alert warning and persist firstAlert on the session', async () => {
    const report = buildReport({
      id: 4,
      updatedAt: '2026-05-15T12:00:00.000Z',
      session: {
        'user-email': 'warning@example.com',
        reference: 'WARN-1',
        alertUser: false
      }
    });

    const { processAlerts, logger, sendEmail, update } = loadSubject({
      reports: [report]
    });

    await processAlerts();

    expect(sendEmail).toHaveBeenCalledWith(
      'soon-template',
      'warning@example.com',
      expect.objectContaining({
        personalisation: expect.objectContaining({
          reference: 'WARN-1'
        })
      })
    );
    expect(update).toHaveBeenCalledWith({
      session: expect.objectContaining({
        firstAlert: true,
        alertUser: false,
        reference: 'WARN-1'
      })
    });
    expectInfoLogs(logger, [
      ['Processed report', { id: 4 }],
      ['Updating report session', { id: 4 }],
      ['Report session updated', { id: 4 }]
    ]);
  });

  test('should skip a run when the previous alert job is still active', async () => {
    let releaseReports;
    const pendingSelect = jest.fn(
      () =>
        new Promise(resolve => {
          releaseReports = resolve;
        })
    );
    const { processAlerts, logger, sendEmail } = loadSubject({
      selectResult: pendingSelect
    });

    const firstRun = processAlerts();
    await processAlerts();

    expect(logger.warn).toHaveBeenCalledWith(
      'Previous job still running, skipping this interval'
    );
    expect(sendEmail).not.toHaveBeenCalled();

    releaseReports([]);
    await firstRun;
  });
});
