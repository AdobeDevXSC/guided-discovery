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
import { useState, useEffect } from "react";
import { aemHeadlessClient, mapErrors } from "./headlessClient";

/**
 * Custom React Hook to perform a GraphQL query using POST
 * Executing a GraphQL query directly using POST should ONLY be done during development.
 * For production always use Persisted Queries see persistedQueries.js
 *
 * @param query - GraphQL query
 */
export default function useGraphQL(query) {
  let [data, setData] = useState(null);
  let [errors, setErrors] = useState(null);

  useEffect(() => {
    async function runGraphQLQuery() {
      try {
        const response = await aemHeadlessClient.runQuery(query);

        if (response.errors) setErrors(mapErrors(response.errors));
        if (response.data) setData(response.data);
      } catch (e) {
        console.error(e.toJSON());
        setErrors(e);
      }
    }

    if (query && query !== "") {
      runGraphQLQuery();
    }
  }, [query]);

  return { data, errors };
}
