ALTER TABLE provenance_layer DROP CONSTRAINT IF EXISTS provenance_layer_layer_type_check;
ALTER TABLE provenance_layer ADD CONSTRAINT provenance_layer_layer_type_check CHECK (layer_type IN ('CLASS_MAP','UNCERTAINTY','SOURCE_INDEX','ERROR_MAP'));
