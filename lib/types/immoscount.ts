
export type ImmoScoutMobileApiReqParams = {
  searchType: string | string[];
  realestatetype: string | string[];
  pagenumber?: string | string[];
  pagesize?: string | string[];
  sorting: string | string[];
  features: string | string[];
  channel: string | string[];
  geocoordinates?: string | string[];
};


export type ImmoScoutMobileApiResponse = {
    totalResults: number;
    pageSize: number;
    pageNumber: number;
    numberOfPages: number;
    numberOfListings: number;
    resultListItems: ImmoScoutMobileApiResponseResultListItem[];
};

export type ImmoScoutMobileApiResponseResultListItem = {
    type: string;
    item: {
        reportUrl: string;
        id: string;
        title: string;
        energyEfficiencyClass?: string;
        pictures: {
            urlScaleAndCrop: string;
        }[];
        titlePicture: {
            preview: string;
            full: string;
        };
        address: {
            line: string;
            lat?: number;
            lon?: number;
            postcode?: string;
        };
        isProject: boolean;
        isPrivate: boolean;
        listingType: string;
        paywallListing?: {
            active: boolean;
            text: string;
        };
        published: string;
        isNewObject: boolean;
        liveVideoTourAvailable: boolean;
        listOnlyOnIs24: boolean;
        attributes: {
            label: string;
            value: string;
        }[];
        realEstateType: string;
        realtor?: {
            logoUrlScale: string;
        };
        tags: {
            tag: string;
            value: {
                type: string;
                realEstateType: string;
            };
        }[];
    };
}