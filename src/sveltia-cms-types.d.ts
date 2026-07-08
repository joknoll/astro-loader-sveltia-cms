import type {
  BuiltInFieldType as PublicBuiltInFieldType,
  CmsConfig as PublicCmsConfig,
  EntryCollection as PublicEntryCollection,
  Field as PublicField,
  FileCollection as PublicFileCollection,
  SelectFieldValue as PublicSelectFieldValue,
} from "../node_modules/@sveltia/cms/types/public.d.ts";

declare module "@sveltia/cms" {
  export type BuiltInFieldType = PublicBuiltInFieldType;
  export type CmsConfig = PublicCmsConfig;
  export type EntryCollection = PublicEntryCollection;
  export type Field = PublicField;
  export type FileCollection = PublicFileCollection;
  export type SelectFieldValue = PublicSelectFieldValue;
}
