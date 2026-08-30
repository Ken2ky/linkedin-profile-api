import { Type } from "@fastify/type-provider-typebox";

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const ProfileRequestSchema = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 500 })
  },
  { additionalProperties: false }
);

export const ExperienceSchema = Type.Object({
  title: NullableString,
  company: NullableString,
  employmentType: NullableString,
  companyLine: NullableString,
  dateRange: NullableString,
  duration: NullableString,
  dateLine: NullableString,
  location: NullableString,
  workplaceType: NullableString,
  description: NullableString,
  associatedSkills: Type.Array(Type.String())
});

export const EducationSchema = Type.Object({
  school: NullableString,
  degree: NullableString,
  fieldOfStudy: NullableString,
  dateRange: NullableString,
  description: NullableString
});

export const CertificationSchema = Type.Object({
  name: NullableString,
  issuingOrganization: NullableString,
  issueDate: NullableString,
  expirationDate: NullableString,
  credentialId: NullableString,
  credentialUrl: NullableString,
  dateLine: NullableString
});

export const SkillSchema = Type.Object({
  name: Type.String(),
  associatedWith: Type.Array(Type.String())
});

export const LanguageSchema = Type.Object({
  name: Type.String(),
  proficiency: NullableString
});

export const ProfileResponseSchema = Type.Object({
  profile: Type.Object({
    profileUrl: Type.String(),
    name: NullableString,
    headline: NullableString,
    location: NullableString,
    about: NullableString,
    profileImages: Type.Object({
      profile: NullableString,
      background: NullableString
    }),
    experience: Type.Array(ExperienceSchema),
    education: Type.Array(EducationSchema),
    skills: Type.Array(SkillSchema),
    certifications: Type.Array(CertificationSchema),
    languages: Type.Array(LanguageSchema)
  }),
  meta: Type.Object({
    partial: Type.Boolean(),
    extractedAt: Type.String(),
    cache: Type.Object({
      status: Type.Union([Type.Literal("hit"), Type.Literal("miss")]),
      ageSeconds: Type.Number({ minimum: 0 })
    }),
    sections: Type.Record(
      Type.String(),
      Type.Object({
        status: Type.Union([
          Type.Literal("complete"),
          Type.Literal("partial"),
          Type.Literal("unavailable"),
          Type.Literal("failed")
        ]),
        reason: Type.Optional(Type.String())
      })
    )
  })
});
