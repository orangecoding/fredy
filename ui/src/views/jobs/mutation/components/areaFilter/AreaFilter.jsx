/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useRef } from 'react';
import Map from '../../../../../components/map/Map.jsx';
import './AreaFilter.less';

export default function AreaFilter() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const handleMapReady = (mapInstance) => {
    map.current = mapInstance;
  };

  return (
    <div className="areaFilter-container">
      <Map
        mapContainerRef={mapContainer}
        style="STANDARD"
        show3dBuildings={false}
        onMapReady={handleMapReady}
        enableDrawing={true}
      />
    </div>
  );
}
