export function transform({
  id,
  name,
  fields
}: any) {
  const fieldValues = {};
  Object.keys(fields).map((key) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    fieldValues[key] = fields[key].value;
  });
  return {
    id,
    name,
    fields: fieldValues,
  };
}
