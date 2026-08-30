import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { parseAboutResponse } from "../src/linkedin/parsers/about.js";

describe("parseAboutResponse", () => {
  it("returns null when LinkedIn explicitly omits About content", () => {
    const stream =
      '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.aboutSection","children":["$","Replaceable",null,{"initialContent":"$undefined"}]}]';
    expect(parseAboutResponse(stream)).toBeNull();
  });

  it("extracts non-empty About text from replaceable content", () => {
    const stream = [
      '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.aboutSection","children":["$","Replaceable",null,{"initialContent":"$L1"}]}]',
      '1:["$","section",null,{"children":["$L2","$L3","$L4"]}]',
      '2:["$","h2",null,{"children":["About"]}]',
      '3:["$","p",null,{"children":["I build reliable distributed systems."]}]',
      '4:["$","button",null,{"children":["see more"]}]'
    ].join("\n");
    expect(parseAboutResponse(stream)).toBe(
      "I build reliable distributed systems."
    );
  });

  it("detects an unsupported component response", () => {
    expect(() => parseAboutResponse('0:["$","div",null,{}]')).toThrow(
      ApplicationError
    );
  });

  it("does not confuse a missing content state with an unavailable About", () => {
    expect(() =>
      parseAboutResponse(
        '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.aboutSection"}]'
      )
    ).toThrow(ApplicationError);
  });
});
