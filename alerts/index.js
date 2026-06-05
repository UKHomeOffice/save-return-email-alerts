'use strict';

const Logger = require('node-json-logger');
const logger = new Logger();
const config = require('../config');
const knexfile = require(`${config.migrationsRepo}`);
const knexfileConfig = knexfile[process.env.NODE_ENV ? 'production' : 'development'];
const tableName = config.tableName;
const { knex } = require('knex');
const db = knex(knexfileConfig);
const moment = require('moment');

const selectableProps = [
  'id',
  'session',
  'created_at',
  'updated_at'
];

const notifyKey = process.env.NOTIFY_KEY;
const NotifyClient = require('notifications-node-client').NotifyClient;
const notifyClient = new NotifyClient(notifyKey);

const TIMEOUT_TEMPLATE = process.env.TIMEOUT_TEMPLATE;
const SAVE_REPORT_TEMPLATE = process.env.SAVE_REPORT_TEMPLATE;
const SOON_TO_BE_DELETED_TEMPLATE = process.env.SOON_TO_BE_DELETED_TEMPLATE;
const DELETE_TEMPLATE = process.env.DELETE_TEMPLATE;
const URL = process.env.APP_URL;

// session timeout in seconds, alert and delete in days
const NRM_FORM_SESSION_TIMEOUT = process.env.SESSION_TTL || 3600;
const FIRST_ALERT_TIMEOUT = process.env.FIRST_ALERT_TIMEOUT || 21;
const DELETION_TIMEOUT = process.env.DELETION_TIMEOUT || 28;
const ALERT_JOB_INTERVAL = 12000;

const sendNotifyEmail = (template, email, content) => {
  return notifyClient.sendEmail(template, email, {
    personalisation: content
  });
};

let isAlertJobRunning = false;

const processAlerts = async () => {
  if (isAlertJobRunning) {
    logger.warn('Previous job still running, skipping this interval');
    return;
  }
  isAlertJobRunning = true;
  try {
    const reports = await db.select(selectableProps).from(tableName);

    for (const report of reports) {
      try {
        const email = report.session['user-email'];
        const updated = moment(report.updated_at);
        const personalisation = {
          reference: report.session.reference,
          deadline: moment(report.updated_at).add(DELETION_TIMEOUT, 'days').format('DD MMMM YYYY'),
          url: URL
        };

        // alert about newly saved case
        if (report.session.alertUser === true) {
          try {
            await sendNotifyEmail(SAVE_REPORT_TEMPLATE, email, personalisation);
          } catch (emailError) {
            logger.error('Email error - sending new save and return email', { id: report.id, error: emailError });
          }
        } else if (!report.session.hasOwnProperty('alertUser') &&
          moment().diff(updated, 'seconds', true) > NRM_FORM_SESSION_TIMEOUT) {
          // check for expired sessions (they wont have an alertUser key but will be over an hour old)
          try {
            await sendNotifyEmail(TIMEOUT_TEMPLATE, email, personalisation);
          } catch (emailError) {
            logger.error('Email error - sending session timeout email', { id: report.id, error: emailError });
          }
        } else if (moment().diff(updated, 'days', true) > DELETION_TIMEOUT) {
          // report is deleted
          try {
            await sendNotifyEmail(DELETE_TEMPLATE, email, personalisation);
          } catch (emailError) {
            logger.error('Email error - sending report deleted email', { id: report.id, error: emailError });
          }
          try {
            await db(tableName).where({ id: report.id }).del();
          } catch (dbError) {
            logger.error('Database error - deleting report record', {
              id: report.id,
              operation: 'delete',
              error: dbError
            });
          }
          continue;
        } else if (!report.session.hasOwnProperty('firstAlert') &&
          moment().diff(updated, 'days', true) >= FIRST_ALERT_TIMEOUT) {
          // report is coming up for deletion
          try {
            await sendNotifyEmail(SOON_TO_BE_DELETED_TEMPLATE, email, personalisation);
          } catch (emailError) {
            logger.error('Email error - sending soon to be deleted warning email', { id: report.id, error: emailError });
          }
          report.session.firstAlert = true;
        } else {
          continue;
        }
        logger.info('Processed report', { id: report.id });
        report.session.alertUser = false;
        try {
          logger.info('Updating report session', { id: report.id });
          await db(tableName).where({ id: report.id }).update({ session: report.session });
          logger.info('Report session updated', { id: report.id });
        } catch (dbError) {
          logger.error('Database error - updating report session', {
            id: report.id,
            operation: 'update',
            error: dbError
          });
        }
      } catch (innerError) {
        logger.error('Error processing report', { id: report.id, error: innerError });
      }
    }
  } catch (error) {
    logger.error('Error in alert job', error);
  } finally {
    isAlertJobRunning = false;
  }
};

// Global handler for unhandled promise rejections
process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection:', reason);
});

setInterval(processAlerts, ALERT_JOB_INTERVAL);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await db.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await db.destroy();
  process.exit(0);
});
