const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { google } = require('googleapis');
const readline = require('readline');

const SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar',
];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

const calendarName = 'Birthday Reminders';
const timezone = 'Europe/Berlin';

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<import('google-auth-library').OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {import('google-auth-library').OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request authorization to call APIs.
 *
 * @returns {Promise<import('google-auth-library').OAuth2Client|null>}
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  const credentialsContent = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(credentialsContent);
  const key = keys.installed || keys.web;
  const oAuth2Client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const authCode = await new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      resolve(code);
    });
  });

  try {
    const { tokens } = await oAuth2Client.getToken(authCode.trim());
    oAuth2Client.setCredentials(tokens);
    await saveCredentials(oAuth2Client);
    return oAuth2Client;
  } catch (err) {
    console.error('Error while trying to retrieve access token:', err.message);
    return null;
  }
}

/**
 * Get all contacts.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @returns {google.people.connections}
 */
async function getAllContacts(auth) {
  const service = google.people({ version: 'v1', auth });

  let connections = [];
  let nextPageToken = '';

  do {
    const res = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 10,
      personFields: 'names,birthdays',
      pageToken: nextPageToken,
    });

    nextPageToken = res.data.nextPageToken;

    connections = connections.concat(res.data.connections);
  } while (nextPageToken);

  return connections;
}

/**
 * Get Birthday calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @returns {google.calendar.calendar}
 */
async function getBirthdayCalendar(auth) {
  const service = google.calendar({ version: 'v3', auth });

  const res = await service.calendarList.list();

  const calendars = res.data.items;

  for (const calendar of calendars) {
    console.log(calendar.summary);

    if (calendar.summary === calendarName) {
      return calendar;
    }
  }
}

/**
 * Create Birthday calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @returns {google.calendar.calendar}
 */
async function createBirthdayCalendar(auth) {
  console.log('Creating calendar', `'${calendarName}'`);

  const service = google.calendar({ version: 'v3', auth });

  const res = await service.calendars.insert({
    requestBody: {
      summary: calendarName,
    },
  });

  return res.data;
}

/**
 * Create calendar event.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} calendarId
 * @param {string} date
 * @param {string} summary
 */
async function createCalendarEvent(auth, calendarId, date, summary) {
  const service = google.calendar({ version: 'v3', auth });

  await service.events.insert({
    calendarId,
    requestBody: {
      summary,
      start: {
        date,
        timeZone: timezone,
      },
      end: {
        date,
        timeZone: timezone,
      },
      transparency: 'transparent',
      reminders: {
        useDefault: true,
      },
      recurrence: ['RRULE:FREQ=YEARLY'],
    },
  });
}

/**
 * Get all calendar events.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} calendarId
 * @returns {google.calendar.event[]}
 */
async function getAllEvents(auth, calendarId) {
  const service = google.calendar({ version: 'v3', auth });

  let events = [];
  let nextPageToken = '';

  do {
    const res = await service.events.list({
      calendarId,
      pageToken: nextPageToken,
    });

    nextPageToken = res.data.nextPageToken;

    events = events.concat(res.data.items);
  } while (nextPageToken);

  return events;
}

/**
 * Delete event from calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} calendarId
 * @param {string} eventId
 */
async function deleteEvent(auth, calendarId, eventId) {
  const service = google.calendar({ version: 'v3', auth });

  await service.events.delete({ calendarId, eventId });
}

/**
 * Remove all events from calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} calendarId
 */
async function clearCalendar(auth, calendarId) {
  const events = await getAllEvents(auth, calendarId);

  if (!events.length) return;

  console.log(
    `Clearing ${events.length} events from calendar '${calendarName}'...`
  );

  for (const event of events) {
    await deleteEvent(auth, calendarId, event.id);
  }
}

/**
 * Main entry point.
 */
async function main() {
  const client = await authorize();

  if (!client) {
    console.log('Authentication failed. Exiting.');
    return;
  }

  // Get or create Birthday calendar
  const calendar =
    (await getBirthdayCalendar(client)) ??
    (await createBirthdayCalendar(client));

  // Clear all existing events
  await clearCalendar(client, calendar.id);

  // Get all contacts
  const contacts = await getAllContacts(client);
  console.log('Found', contacts.length, 'contacts');

  // Loop over contacts to create an event for each
  for (const contact of contacts) {
    console.log('Adding', contact.names[0].displayName, '...');

    if (!contact.birthdays || !contact.birthdays.length) continue;

    const date = `${contact.birthdays[0].date.year}-${contact.birthdays[0].date.month}-${contact.birthdays[0].date.day}`;
    const summary = `${contact.names[0].displayName} hat Geburtstag`;

    await createCalendarEvent(client, calendar.id, date, summary);
  }
}

main();