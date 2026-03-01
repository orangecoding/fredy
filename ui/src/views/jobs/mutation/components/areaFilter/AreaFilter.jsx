/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Map from '../../../../../components/map/Map.jsx';
import './AreaFilter.less';

export default function AreaFilter({ spatialFilter = null, onChange = null }) {
  return (
    <div className="areaFilter">
      <Map
        style="STANDARD"
        show3dBuildings={false}
        enableDrawing={true}
        initialSpatialFilter={spatialFilter}
        onDrawingChange={onChange}
      />
    </div>
  );
}
