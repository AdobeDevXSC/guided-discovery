/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

// Use the AEM Headless SDK to make the GraphQL requests
const { AEMHeadless } = require('@adobe/aem-headless-client-js');

// environment variable for configuring the headless client
const {
    REACT_APP_HOST_URI,
    REACT_APP_GRAPHQL_ENDPOINT,
    REACT_APP_AUTH_METHOD,
    REACT_APP_DEV_TOKEN,
    REACT_APP_BASIC_AUTH_USER,
    REACT_APP_BASIC_AUTH_PASS
} = process.env;

const serviceURL = REACT_APP_HOST_URI;

// Get authorization based on environment variables
// authorization is not needed when connecting to Publish environments
const setAuthorization = function () {
    if (REACT_APP_AUTH_METHOD === 'basic') {
        return [REACT_APP_BASIC_AUTH_USER, REACT_APP_BASIC_AUTH_PASS];
    } else if (REACT_APP_AUTH_METHOD === 'dev-token') {
        return REACT_APP_DEV_TOKEN;
    } else {
        // no authentication set
        return;
    }
}
export const aemHeadlessClient = new AEMHeadless({
    serviceURL: serviceURL,
    endpoint: REACT_APP_GRAPHQL_ENDPOINT,
    auth: setAuthorization()
});

/**
 * concatenate error messages into a single string.
 * @param {*} errors
 */
export const mapErrors = function (errors) {
    return errors.map((error) => error.message).join(",");
}