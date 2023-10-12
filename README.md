# Google Calendar Birthday Notifications

This is a simple script to add a separate birthday calendar with events for each Google contact that has a birthday set.

While there is a built-in 'Birthday' calendar already, it doesn't provide any notifications or event-editing capabilities whatsoever.

## Prerequisites

1. A Google Cloud project

1. NodeJS installed

1. Some contacts of course

## How to use

1. Clone this repo

1. Create a [Google Cloud](https://console.cloud.google.com) project or re-use an existing one

1. Create an [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)

   - Follow the instructions in the setup wizard

1. Enable the following APIs:

   - [Google People API ](https://console.cloud.google.com/apis/library/people.googleapis.com)
   - [Google Calendar API ](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

1. Create [OAuth Credentials](https://console.cloud.google.com/apis/credentials)

   - Choose 'OAuth client ID'
   - Application type is 'Desktop app'
   - Download the JSON and save it to the repo folder as `credentials.json`

1. Inside the repo folder run

   ```
   npm i
   ```

   to install all dependencies

1. To run the tool, execute

   ```
   node src/index.js
   ```

## Caveats

1. **Reminders**

   Due to some limitations in the Calendar API we cannot programatically set default reminders for all day events.

   Additionally, programatically created events don't use any existing (manually created) default reminders.

   The only workaround I found was to:

   1. First (!) remove any default reminders
   1. Then run the script
   1. Finally re-add the default reminders

   This seems to be working. Let me know if you find any better way!
