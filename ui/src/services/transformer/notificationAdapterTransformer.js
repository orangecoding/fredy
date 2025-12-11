/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function transform({ id, name, fields }) {
  const fieldValues = {};
  Object.keys(fields).map((key) => {
    fieldValues[key] = fields[key].value;
  });
  return {
    id,
    name,
    fields: fieldValues,
  };
}
