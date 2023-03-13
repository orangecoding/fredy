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
