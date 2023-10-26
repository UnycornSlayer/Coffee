require('dotenv').config();
const axios = require('axios');
const { Client } = require('@notionhq/client');
const fs = require('fs');
const User = require('./user.js');
const notion = new Client({ auth: NOTION_API_KEY });

// Create an array to store new user data
const newUsers = [];

// Function to find and return the User object with updated dates
function findUserWithUpdatedDates(newUsers, existingUsers) {
    for (const newUser of newUsers) {
        const existingUser = existingUsers.find(user => user.name === newUser.name);
        if (existingUser && existingUser.date !== newUser.date) {
            // Update the existing User object with the new date and old dateBefore
            existingUser.dateBefore = existingUser.date;
            existingUser.date = newUser.date;
            return existingUser;
        }
    }
    return null; // Return null if no changes are found
}

// Function to query the Notion database for a specific user's page ID
async function queryUserPageId(databaseId, username) {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            "filter": {
                "property": "Name",
                "rich_text": {
                    "contains": username
                }
            }
        });
        return response.results[0].id;
    } catch (error) {
        console.log(error.body);
    }
}

// Function to update a user's information in the Notion database
async function updateUserInNotion(databaseId, username, lastDate, dateBefore) {
    const pageId = await queryUserPageId(databaseId, username);
    if (pageId) {
        try {
            const response = await notion.pages.update({
                page_id: pageId,
                properties: {
                    'Last date': {
                        type: 'date',
                        date: {
                            "start": lastDate
                        }
                    },
                    'Date before': {
                        type: 'date',
                        date: {
                            "start": dateBefore
                        }
                    },
                },
            });
        } catch (error) {
            console.log(error.body);
        }
    } else {
        console.log('User not found in the Notion database.');
    }
}

(async () => {
    const response = await notion.databases.query({ database_id: DATABASE_ID });

    for (const element of response.results) {
        const name = element.properties["Name"].title[0].plain_text;
        const date = element.properties["Last date"].date.start;
        const dateBefore = element.properties["Date before"].date.start;
        newUsers.push(new User(name, date, dateBefore));
    }

    // Call a separate async function to handle changes or find the user with the oldest date
    await handleChangesOrFindOldestUser(newUsers);
})();

// Define a separate async function for handling changes or finding the user with the oldest date
async function handleChangesOrFindOldestUser(newUsers) {
    // Convert the users array to a JSON string
    let existingUsers = [];
    if (fs.existsSync('users.json')) {
        const existingData = fs.readFileSync('users.json', 'utf-8');
        existingUsers = JSON.parse(existingData);
    }

    // Find the User object with updated dates
    const updatedUser = findUserWithUpdatedDates(newUsers, existingUsers);

    if (updatedUser) {
        console.log('Changes detected.');
        console.log('Updated User:', updatedUser);

        updateUserInNotion(DATABASE_ID, updatedUser.name, updatedUser.date, updatedUser.dateBefore);

        // Write the updated data back to the JSON file
        fs.writeFileSync('users.json', JSON.stringify(existingUsers, null, 2), 'utf-8');
        console.log('Users.json has been updated with the changes.');
    } else {
        const userToPay = newUsers.reduce((minDateUser, currentUser) => {
            const minDate = new Date(minDateUser.date);
            const currentDate = new Date(currentUser.date);
            return currentDate < minDate ? currentUser : minDateUser;
        }, newUsers[0]);

        console.log('No changes detected.');
        console.log('User with the oldest date:', userToPay);

        // Set the user's date field to today's date and dateBefore to the old date
        userToPay.dateBefore = userToPay.date; // Store the current date in dateBefore
        const today = new Date(); // Get today's date
        userToPay.date = today.toISOString().slice(0, 10); // Set the date to today

        // Update the user in Notion with the updated date and dateBefore
        updateUserInNotion(DATABASE_ID, userToPay.name, userToPay.date, userToPay.dateBefore);

        // Update users.json with userToPay
        existingUsers.push(userToPay);
        fs.writeFileSync('users.json', JSON.stringify(existingUsers, null, 2), 'utf-8');
        console.log('Users.json has been updated with the user to pay.');
    }
}
