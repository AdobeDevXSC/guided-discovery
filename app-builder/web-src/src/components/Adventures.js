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
import React, {useState, useEffect} from 'react';
import {Link} from 'react-router-dom';
import CurrencyFormat from 'react-currency-format';
import {getAllAdventures, getAdventuresByActivity} from '../api/persistedQueries';
import Error from './Error';
import Loading from './Loading';
import './Adventures.scss';

function Adventures({adventureActivity}) {
    
    const [response, setResponse] = useState();

    useEffect(() => {

        // set response to null while fetching the new data (prompts loading icon)
        setResponse();

        // if an activity is set (i.e "Camping", "Hiking"...)
        if(adventureActivity && adventureActivity !== '') {
            // run a filter query to get adventures based on the activity
            getAdventuresByActivity(adventureActivity)
                .then(response => setResponse(response));
        }
        else {
            // Otherwise get all the adventures data (unfiltered)
            getAllAdventures()
                .then(response => setResponse(response));
        }
      }, [adventureActivity])

    //If response is null then return a loading state...
    if(!response) return <Loading />;

    //If there is an error with the GraphQL query
    if(response && response.errors) return <Error errorMessage={response.errors} />;
    
    return (
        <div className="adventures">
          <ul className="adventure-items">
            {
                //Iterate over the returned data items from the query
                response.data.adventureList.items.map((adventure) => {
                    return (
                        <AdventureListItem key={adventure.slug} {...adventure} />
                    );
                })
            }
            </ul>
        </div>
    );
}

// Render individual Adventure item
function AdventureListItem({title, slug, primaryImage, tripLength, price}) {

  //Must have title, path, and image
  if(!title || !title || !primaryImage ) {
    return null;
  }
  return (
        <li className="adventure-item">
          <Link to={`/adventure:${slug}`}>
            <img className="adventure-item-image" src={`${process.env.REACT_APP_HOST_URI}${primaryImage._path}`} 
                  alt={title}/>
          </Link>
          <div className="adventure-item-length-price">
            <div className="adventure-item-length">{tripLength}</div>
            <div className="adventure-item-price">
                <CurrencyFormat value={price} displayType={'text'} thousandSeparator={true} prefix={'$'} />
            </div>
          </div>
          <div className="adventure-item-title">{title}</div>
      </li>
      );
}

export default Adventures;
