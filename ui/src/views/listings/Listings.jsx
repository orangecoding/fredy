/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ListingsGrid from '../../components/grid/listings/ListingsGrid.jsx';
import Headline from '../../components/headline/Headline.jsx';

export default function Listings() {
  return (
    <>
      <Headline text="Listings" />
      <ListingsGrid />
    </>
  );
}
