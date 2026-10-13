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
import React, {useState} from 'react';
import Adventures from './Adventures';

/***
 * Displays a grid of current adventures
 */
function Home() {
    const [adventureActivity, setAdventureActivity] = useState('');

    return (
      <div className="Home">
        <h2>Current Adventures</h2>
        <div className="adventure-nav">
          <button onClick={() => setAdventureActivity('')}>All</button>
          <button onClick={() => setAdventureActivity('Camping')}>Camping</button>
          <button onClick={() => setAdventureActivity('Cycling')}>Cycling</button>
          <button onClick={() => setAdventureActivity('Rock Climbing')}>Rock Climbing</button>
          <button onClick={() => setAdventureActivity('Skiing')}>Skiing</button>
          <button onClick={() => setAdventureActivity('Social')}>Social</button>
          <button onClick={() => setAdventureActivity('Surfing')}>Surfing</button>
        </div>
        <Adventures adventureActivity={adventureActivity} />
    </div>
    );
}

export default Home;