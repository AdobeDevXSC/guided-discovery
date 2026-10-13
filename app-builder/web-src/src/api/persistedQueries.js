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

/**
 * persistedQueries.js - provides a wrapper utility of persisted queries that are expected to be available on the AEM environment
 */
import { aemHeadlessClient , mapErrors} from "./headlessClient";

/**
 * Queries a list of all Adventures using the persisted path "wknd-shared/adventures-all"
 * @returns {data, errors}
 */
export const getAllAdventures = async function() {
    return executePersistedQuery('wknd-shared/adventures-all');
}

/**
 * Queries a single adventure based on its slug to a content fragment
 * uses persisted path 'wknd-shared/adventure-by-slug'
 * @param {*} adventurePath 
 * @returns 
 */
 export const getAdventureBySlug = async function(adventureSlug) {
    const queryVariables = {'slug': adventureSlug};
    return executePersistedQuery('wknd-shared/adventure-by-slug', queryVariables);
}

/**
 * Filters a list of adventures by activity 
 * using the persisted path 'wknd-shared/adventures-by-activity'
 * @param {*} activityType 
 * @returns 
 */
export const getAdventuresByActivity = async function(activityType) {
    const queryVariables = { 'activity': activityType }; // expected query variables
    return executePersistedQuery('wknd-shared/adventures-by-activity', queryVariables);
}

/**
 * Queries a single adventure based on a path to a content fragment
 * uses persisted path 'wknd-shared/adventures-by-path'
 * @param {*} adventurePath 
 * @returns 
 */
export const getAdventureByPath = async function(adventurePath) {
    const queryVariables = {'adventurePath': adventurePath};
    return executePersistedQuery('wknd-shared/adventures-by-path', queryVariables);
}

/**
 * Uses the AEM Headless SDK to execute a query besed on a persistedQueryPath and optional query variables
 * @param {*} persistedQueryPath 
 * @param {*} queryVariables 
 * @returns 
 */
 const executePersistedQuery = async function(persistedQueryPath, queryVariables) {

    let data;
    let errors;

    try {
        // AEM GraphQL queries are asynchronous, either await their return or use Promise-based .then(..) { ... } syntax
        const response = await aemHeadlessClient.runPersistedQuery(persistedQueryPath, queryVariables);
        // The GraphQL data is stored on the response's data field
        data = response.data;
        errors = response.errors ? mapErrors(response.errors) : undefined;
    } catch (e) {
        console.error(e);
        errors = e;
    }

    return {data, errors}; 
}
