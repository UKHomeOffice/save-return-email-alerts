# Save & Return Email Alerts Service
Provides an alert email service that uses Gov Notify to send periodic alerts depending on database updates.

## Database connection
This repo uses ms-schema as default to connect to postgres. You could supply a different dependency to connect to a DB if you wanted to using the `MIGRATIONS_REPO` environmental variable. ms-schema uses knex which, if NODE_ENV is not set, will try to connect to a localhost instance of postgres. If it is set, it will try to use the below environmental variables `DB_HOST` etc... to connect to a formal DB using the proper credentials.

## Env Vars
You can set the following to specific how you want your results to look:
- `SERVICE_TYPE` - This specifies what service you are using the lookup UI for. The default is for the modern slavery service. But additional templates could be created which this drives.
- `TABLE_NAME` - This specifies the SQL table name you want to query. This defaults to 'reports'.
- `CLIENT` - This is the database client type. This defaults to postgresql.
- `DB_HOST`,`DB_USER`,`DB_PASS`,`DB_NAME` - These are production credentials for accessing the relevant database. These default to 'knex' for the user and password, and 'knex_session' for the database name. These are only for local development.
- `NOTIFY_KEY` - Gov Notify API key for sending emails.
- `TIMEOUT_TEMPLATE` - Gov Notify template ID for timeout notifications.
- `SAVE_REPORT_TEMPLATE` - Gov Notify template ID for saved report notifications.
- `SOON_TO_BE_DELETED_TEMPLATE` - Gov Notify template ID for imminent record deletion notifications.
- `DELETE_TEMPLATE` - Gov Notify template ID for deleted record notifications.
- `APP_URL` - Application URL to be included in Gov Notify notifications.
- `MIGRATIONS_REPO` - A migrations repository containing a knexfile for connecting to a DB. Default to ms-schema which may contain what you need. Test data contained that repo if you n

(Optional)
- `SESSION_TTL` - Timeout for application form added to Gov Notify Notifications. Defaults to 3600 seconds (1 hour).
- `FIRST_ALERT_TIMEOUT` - Time (in days, can be fractional for sub-day windows) since first alert before Notify message sends a 2nd alert informing user of time frame left to access report. For example, `0.5` means 12 hours. Defaults to 21 days. `moment.diff` function accepts floating point numbers.
- `DELETION_TIMEOUT` - Time (in days, can be fractional for sub-day windows) applicant has left to access the report since the 2nd alert. For example, `0.5` means 12 hours. Defaults to 28 days. `moment.diff` function accepts floating point numbers.

## Local Setup
The migrations and seeds folders are used by knex to setup a local DB with dummy information for testing the service. These are not used in production where it is assumed a separate DB is setup for knex to connect to that is already setup.

Run the following commands to setup a test DB:
```
brew install postgres
brew services start postgresql
psql postgres
CREATE ROLE knex WITH LOGIN PASSWORD 'knex';
ALTER ROLE knex WITH SUPERUSER;
CREATE DATABASE knex_session;
\q
```
If you download Postico for Mac (https://eggerapps.at/postico/), you can then inspect your postgres DB for example and look at the test entries inserted into the test table 'Reports'.

You then need to use a knexfile with migrations and seeds folders to populate your database.
The ms-schema repo which is used for migrations in the Modern Slavery service (https://github.com/UKHomeOffice/ms-schema) can be used as a test example and is included in this project. You can run
```
yarn run db:setup
```
from that repo to setup your database.

## Install & Run <a name="install-and-run"></a>
The application can be run on your local machine

### Prerequisite <a name="prerequisites"></a>
You will need to have the following installed:

[Node JS](https://nodejs.org/en/download/releases/) ( LTS Erbium v14.x )

[npm](https://www.npmjs.com/get-npm) ( v6.x )

[yarn](https://classic.yarnpkg.com/en/docs/install/#mac-stable) ( v1.22.5.x )

[PostgreSQL](https://www.postgresql.org/download/) ( v12.x )

## Running the application

Ensure your database service is available and running.

Then to run the service use:

 ```yarn run alerts``` to run the server.

With the server running you can run the main app with save and return lookup UI functionality.
See details of how to do this in [modern slavery](https://github.com/UKHomeOffice/modern-slavery) application

## Security scanning
Security scanning happens weekly using Snyk. This snyk scan also run on pull requests.
