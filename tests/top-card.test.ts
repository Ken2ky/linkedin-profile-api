import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { parseTopCard } from "../src/linkedin/parsers/top-card.js";
import { decodeRscRecords } from "../src/linkedin/rsc/decode-records.js";

const stream = [
  '0:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L1","$L2","$L3","$L4","$L5","$L6"]}]',
  '1:["$","Wrapper",null,{"children":"$L7"}]',
  '2:["$","Text",null,{"textProps":{"children":["· 2nd"]}}]',
  '3:["$","p",null,{"children":["Platform Engineer"]}]',
  '4:["$","Text",null,{"textProps":{"children":["Example Corp · Example University"]}}]',
  '5:["$","Text",null,{"textProps":{"children":["Greater London Area"]}}]',
  '6:["$","Photo",null,{"viewTrackingSpecs":{"viewName":"profile-top-card-member-photo"},"children":"$L8"}]',
  '7:["$","h2",null,{"children":["Example Person"]}]',
  '8:["$","Image",null,{"renderPayload":{"rootUrl":"https://media.licdn.com/profile-displayphoto-","imageRenditions":[{"width":100,"height":100,"suffixUrl":"small"},{"width":400,"height":400,"suffixUrl":"large"}]}}]'
].join("\n");

describe("parseTopCard", () => {
  it("extracts semantic profile fields and the largest safe image rendition", () => {
    expect(parseTopCard(decodeRscRecords(stream))).toEqual({
      name: "Example Person",
      headline: "Platform Engineer",
      location: "Greater London Area",
      profileImage: "https://media.licdn.com/profile-displayphoto-large",
      backgroundImage: null
    });
  });

  it("rejects a response without a semantic top-card marker", () => {
    expect(() => parseTopCard(decodeRscRecords('0:["$","div",null,{}]'))).toThrow(
      ApplicationError
    );
  });

  it("does not mistake the company and education summary for location", () => {
    const response = [
      '0:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L1","$L2","$L3","$L4"]}]',
      '1:["$","h2",null,{"children":["Example Person"]}]',
      '2:["$","p",null,{"children":["Software Engineer"]}]',
      '3:["$","Text",null,{"textProps":{"children":["Example Corp · Example University, Campus"]}}]',
      '4:["$","Text",null,{"textProps":{"children":["Bengaluru, Karnataka, India"]}}]'
    ].join("\n");

    expect(parseTopCard(decodeRscRecords(response)).location).toBe(
      "Bengaluru, Karnataka, India"
    );
  });

  it("selects the complete top-card variant when an earlier variant has no name", () => {
    const response = [
      '0:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L1","$L2"]}]',
      '1:["$","p",null,{"children":["Software Engineer"]}]',
      '2:["$","Text",null,{"textProps":{"children":["Bengaluru, India"]}}]',
      '3:["$","Wrapper",null,{"content":["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L4","$L5","$L6","$L7"]}]}]',
      '4:["$","h2",null,{"children":["Example Person"]}]',
      '5:["$","p",null,{"children":["View Example’s verifications"]}]',
      '6:["$","p",null,{"children":["Software Engineer"]}]',
      '7:["$","Text",null,{"textProps":{"children":["Bengaluru, India"]}}]'
    ].join("\n");

    expect(parseTopCard(decodeRscRecords(response))).toMatchObject({
      name: "Example Person",
      headline: "Software Engineer",
      location: "Bengaluru, India"
    });
  });

  it("rejects a marked top card without a recognizable name", () => {
    const response =
      '0:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$","p",null,{"children":["Software Engineer"]}]}]';

    expect(() => parseTopCard(decodeRscRecords(response))).toThrow(
      /recognizable name/
    );
  });

  it("falls back to the document title when the top-card heading is detached", () => {
    const response = [
      '0:{"component":[["$","title",null,{"children":"Example Person | LinkedIn"}],["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L1","$L2"]}]]}',
      '1:["$","p",null,{"children":["Software Engineer"]}]',
      '2:["$","Text",null,{"textProps":{"children":["Bengaluru, India"]}}]'
    ].join("\n");

    expect(parseTopCard(decodeRscRecords(response))).toMatchObject({
      name: "Example Person",
      headline: "Software Engineer",
      location: "Bengaluru, India"
    });
  });
});
