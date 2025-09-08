import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

/* Example Usage: ConverseCommand
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"; // ES Modules import
// const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime"); // CommonJS import
const client = new BedrockRuntimeClient(config);
const input = { // ConverseRequest
  modelId: "STRING_VALUE", // required
  messages: [ // Messages
    { // Message
      role: "user" || "assistant", // required
      content: [ // ContentBlocks // required
        { // ContentBlock Union: only one key present
          text: "STRING_VALUE",
          image: { // ImageBlock
            format: "png" || "jpeg" || "gif" || "webp", // required
            source: { // ImageSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: { // S3Location
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
            },
          },
          document: { // DocumentBlock
            format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
            name: "STRING_VALUE", // required
            source: { // DocumentSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: {
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
              text: "STRING_VALUE",
              content: [ // DocumentContentBlocks
                { // DocumentContentBlock Union: only one key present
                  text: "STRING_VALUE",
                },
              ],
            },
            context: "STRING_VALUE",
            citations: { // CitationsConfig
              enabled: true || false, // required
            },
          },
          video: { // VideoBlock
            format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
            source: { // VideoSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: {
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
            },
          },
          toolUse: { // ToolUseBlock
            toolUseId: "STRING_VALUE", // required
            name: "STRING_VALUE", // required
            input: "DOCUMENT_VALUE", // required
          },
          toolResult: { // ToolResultBlock
            toolUseId: "STRING_VALUE", // required
            content: [ // ToolResultContentBlocks // required
              { // ToolResultContentBlock Union: only one key present
                json: "DOCUMENT_VALUE",
                text: "STRING_VALUE",
                image: {
                  format: "png" || "jpeg" || "gif" || "webp", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: {
                      uri: "STRING_VALUE", // required
                      bucketOwner: "STRING_VALUE",
                    },
                  },
                },
                document: {
                  format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
                  name: "STRING_VALUE", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: {
                      uri: "STRING_VALUE", // required
                      bucketOwner: "STRING_VALUE",
                    },
                    text: "STRING_VALUE",
                    content: [
                      {//  Union: only one key present
                        text: "STRING_VALUE",
                      },
                    ],
                  },
                  context: "STRING_VALUE",
                  citations: {
                    enabled: true || false, // required
                  },
                },
                video: {
                  format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: "<S3Location>",
                  },
                },
              },
            ],
            status: "success" || "error",
          },
          guardContent: { // GuardrailConverseContentBlock Union: only one key present
            text: { // GuardrailConverseTextBlock
              text: "STRING_VALUE", // required
              qualifiers: [ // GuardrailConverseContentQualifierList
                "grounding_source" || "query" || "guard_content",
              ],
            },
            image: { // GuardrailConverseImageBlock
              format: "png" || "jpeg", // required
              source: { // GuardrailConverseImageSource Union: only one key present
                bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              },
            },
          },
          cachePoint: { // CachePointBlock
            type: "default", // required
          },
          reasoningContent: { // ReasoningContentBlock Union: only one key present
            reasoningText: { // ReasoningTextBlock
              text: "STRING_VALUE", // required
              signature: "STRING_VALUE",
            },
            redactedContent: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
          },
          citationsContent: { // CitationsContentBlock
            content: [ // CitationGeneratedContentList
              { // CitationGeneratedContent Union: only one key present
                text: "STRING_VALUE",
              },
            ],
            citations: [ // Citations
              { // Citation
                title: "STRING_VALUE",
                sourceContent: [ // CitationSourceContentList
                  { // CitationSourceContent Union: only one key present
                    text: "STRING_VALUE",
                  },
                ],
                location: { // CitationLocation Union: only one key present
                  documentChar: { // DocumentCharLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                  documentPage: { // DocumentPageLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                  documentChunk: { // DocumentChunkLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                },
              },
            ],
          },
        },
      ],
    },
  ],
  system: [ // SystemContentBlocks
    { // SystemContentBlock Union: only one key present
      text: "STRING_VALUE",
      guardContent: {//  Union: only one key present
        text: {
          text: "STRING_VALUE", // required
          qualifiers: [
            "grounding_source" || "query" || "guard_content",
          ],
        },
        image: {
          format: "png" || "jpeg", // required
          source: {//  Union: only one key present
            bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
          },
        },
      },
      cachePoint: {
        type: "default", // required
      },
    },
  ],
  inferenceConfig: { // InferenceConfiguration
    maxTokens: Number("int"),
    temperature: Number("float"),
    topP: Number("float"),
    stopSequences: [ // NonEmptyStringList
      "STRING_VALUE",
    ],
  },
  toolConfig: { // ToolConfiguration
    tools: [ // Tools // required
      { // Tool Union: only one key present
        toolSpec: { // ToolSpecification
          name: "STRING_VALUE", // required
          description: "STRING_VALUE",
          inputSchema: { // ToolInputSchema Union: only one key present
            json: "DOCUMENT_VALUE",
          },
        },
        cachePoint: "<CachePointBlock>",
      },
    ],
    toolChoice: { // ToolChoice Union: only one key present
      auto: {},
      any: {},
      tool: { // SpecificToolChoice
        name: "STRING_VALUE", // required
      },
    },
  },
  guardrailConfig: { // GuardrailConfiguration
    guardrailIdentifier: "STRING_VALUE", // required
    guardrailVersion: "STRING_VALUE", // required
    trace: "enabled" || "disabled" || "enabled_full",
  },
  additionalModelRequestFields: "DOCUMENT_VALUE",
  promptVariables: { // PromptVariableMap
    "<keys>": { // PromptVariableValues Union: only one key present
      text: "STRING_VALUE",
    },
  },
  additionalModelResponseFieldPaths: [ // AdditionalModelResponseFieldPaths
    "STRING_VALUE",
  ],
  requestMetadata: { // RequestMetadata
    "<keys>": "STRING_VALUE",
  },
  performanceConfig: { // PerformanceConfiguration
    latency: "standard" || "optimized",
  },
};
const command = new ConverseCommand(input);
const response = await client.send(command);
*/
// { // ConverseResponse
//   output: { // ConverseOutput Union: only one key present
//     message: { // Message
//       role: "user" || "assistant", // required
//       content: [ // ContentBlocks // required
//         { // ContentBlock Union: only one key present
//           text: "STRING_VALUE",
//           image: { // ImageBlock
//             format: "png" || "jpeg" || "gif" || "webp", // required
//             source: { // ImageSource Union: only one key present
//               bytes: new Uint8Array(),
//               s3Location: { // S3Location
//                 uri: "STRING_VALUE", // required
//                 bucketOwner: "STRING_VALUE",
//               },
//             },
//           },
//           document: { // DocumentBlock
//             format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
//             name: "STRING_VALUE", // required
//             source: { // DocumentSource Union: only one key present
//               bytes: new Uint8Array(),
//               s3Location: {
//                 uri: "STRING_VALUE", // required
//                 bucketOwner: "STRING_VALUE",
//               },
//               text: "STRING_VALUE",
//               content: [ // DocumentContentBlocks
//                 { // DocumentContentBlock Union: only one key present
//                   text: "STRING_VALUE",
//                 },
//               ],
//             },
//             context: "STRING_VALUE",
//             citations: { // CitationsConfig
//               enabled: true || false, // required
//             },
//           },
//           video: { // VideoBlock
//             format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
//             source: { // VideoSource Union: only one key present
//               bytes: new Uint8Array(),
//               s3Location: {
//                 uri: "STRING_VALUE", // required
//                 bucketOwner: "STRING_VALUE",
//               },
//             },
//           },
//           toolUse: { // ToolUseBlock
//             toolUseId: "STRING_VALUE", // required
//             name: "STRING_VALUE", // required
//             input: "DOCUMENT_VALUE", // required
//           },
//           toolResult: { // ToolResultBlock
//             toolUseId: "STRING_VALUE", // required
//             content: [ // ToolResultContentBlocks // required
//               { // ToolResultContentBlock Union: only one key present
//                 json: "DOCUMENT_VALUE",
//                 text: "STRING_VALUE",
//                 image: {
//                   format: "png" || "jpeg" || "gif" || "webp", // required
//                   source: {//  Union: only one key present
//                     bytes: new Uint8Array(),
//                     s3Location: {
//                       uri: "STRING_VALUE", // required
//                       bucketOwner: "STRING_VALUE",
//                     },
//                   },
//                 },
//                 document: {
//                   format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
//                   name: "STRING_VALUE", // required
//                   source: {//  Union: only one key present
//                     bytes: new Uint8Array(),
//                     s3Location: {
//                       uri: "STRING_VALUE", // required
//                       bucketOwner: "STRING_VALUE",
//                     },
//                     text: "STRING_VALUE",
//                     content: [
//                       {//  Union: only one key present
//                         text: "STRING_VALUE",
//                       },
//                     ],
//                   },
//                   context: "STRING_VALUE",
//                   citations: {
//                     enabled: true || false, // required
//                   },
//                 },
//                 video: {
//                   format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
//                   source: {//  Union: only one key present
//                     bytes: new Uint8Array(),
//                     s3Location: "<S3Location>",
//                   },
//                 },
//               },
//             ],
//             status: "success" || "error",
//           },
//           guardContent: { // GuardrailConverseContentBlock Union: only one key present
//             text: { // GuardrailConverseTextBlock
//               text: "STRING_VALUE", // required
//               qualifiers: [ // GuardrailConverseContentQualifierList
//                 "grounding_source" || "query" || "guard_content",
//               ],
//             },
//             image: { // GuardrailConverseImageBlock
//               format: "png" || "jpeg", // required
//               source: { // GuardrailConverseImageSource Union: only one key present
//                 bytes: new Uint8Array(),
//               },
//             },
//           },
//           cachePoint: { // CachePointBlock
//             type: "default", // required
//           },
//           reasoningContent: { // ReasoningContentBlock Union: only one key present
//             reasoningText: { // ReasoningTextBlock
//               text: "STRING_VALUE", // required
//               signature: "STRING_VALUE",
//             },
//             redactedContent: new Uint8Array(),
//           },
//           citationsContent: { // CitationsContentBlock
//             content: [ // CitationGeneratedContentList
//               { // CitationGeneratedContent Union: only one key present
//                 text: "STRING_VALUE",
//               },
//             ],
//             citations: [ // Citations
//               { // Citation
//                 title: "STRING_VALUE",
//                 sourceContent: [ // CitationSourceContentList
//                   { // CitationSourceContent Union: only one key present
//                     text: "STRING_VALUE",
//                   },
//                 ],
//                 location: { // CitationLocation Union: only one key present
//                   documentChar: { // DocumentCharLocation
//                     documentIndex: Number("int"),
//                     start: Number("int"),
//                     end: Number("int"),
//                   },
//                   documentPage: { // DocumentPageLocation
//                     documentIndex: Number("int"),
//                     start: Number("int"),
//                     end: Number("int"),
//                   },
//                   documentChunk: { // DocumentChunkLocation
//                     documentIndex: Number("int"),
//                     start: Number("int"),
//                     end: Number("int"),
//                   },
//                 },
//               },
//             ],
//           },
//         },
//       ],
//     },
//   },
//   stopReason: "end_turn" || "tool_use" || "max_tokens" || "stop_sequence" || "guardrail_intervened" || "content_filtered", // required
//   usage: { // TokenUsage
//     inputTokens: Number("int"), // required
//     outputTokens: Number("int"), // required
//     totalTokens: Number("int"), // required
//     cacheReadInputTokens: Number("int"),
//     cacheWriteInputTokens: Number("int"),
//   },
//   metrics: { // ConverseMetrics
//     latencyMs: Number("long"), // required
//   },
//   additionalModelResponseFields: "DOCUMENT_VALUE",
//   trace: { // ConverseTrace
//     guardrail: { // GuardrailTraceAssessment
//       modelOutput: [ // ModelOutputs
//         "STRING_VALUE",
//       ],
//       inputAssessment: { // GuardrailAssessmentMap
//         "<keys>": { // GuardrailAssessment
//           topicPolicy: { // GuardrailTopicPolicyAssessment
//             topics: [ // GuardrailTopicList // required
//               { // GuardrailTopic
//                 name: "STRING_VALUE", // required
//                 type: "DENY", // required
//                 action: "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//           },
//           contentPolicy: { // GuardrailContentPolicyAssessment
//             filters: [ // GuardrailContentFilterList // required
//               { // GuardrailContentFilter
//                 type: "INSULTS" || "HATE" || "SEXUAL" || "VIOLENCE" || "MISCONDUCT" || "PROMPT_ATTACK", // required
//                 confidence: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
//                 filterStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH",
//                 action: "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//           },
//           wordPolicy: { // GuardrailWordPolicyAssessment
//             customWords: [ // GuardrailCustomWordList // required
//               { // GuardrailCustomWord
//                 match: "STRING_VALUE", // required
//                 action: "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//             managedWordLists: [ // GuardrailManagedWordList // required
//               { // GuardrailManagedWord
//                 match: "STRING_VALUE", // required
//                 type: "PROFANITY", // required
//                 action: "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//           },
//           sensitiveInformationPolicy: { // GuardrailSensitiveInformationPolicyAssessment
//             piiEntities: [ // GuardrailPiiEntityFilterList // required
//               { // GuardrailPiiEntityFilter
//                 match: "STRING_VALUE", // required
//                 type: "ADDRESS" || "AGE" || "AWS_ACCESS_KEY" || "AWS_SECRET_KEY" || "CA_HEALTH_NUMBER" || "CA_SOCIAL_INSURANCE_NUMBER" || "CREDIT_DEBIT_CARD_CVV" || "CREDIT_DEBIT_CARD_EXPIRY" || "CREDIT_DEBIT_CARD_NUMBER" || "DRIVER_ID" || "EMAIL" || "INTERNATIONAL_BANK_ACCOUNT_NUMBER" || "IP_ADDRESS" || "LICENSE_PLATE" || "MAC_ADDRESS" || "NAME" || "PASSWORD" || "PHONE" || "PIN" || "SWIFT_CODE" || "UK_NATIONAL_HEALTH_SERVICE_NUMBER" || "UK_NATIONAL_INSURANCE_NUMBER" || "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER" || "URL" || "USERNAME" || "US_BANK_ACCOUNT_NUMBER" || "US_BANK_ROUTING_NUMBER" || "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER" || "US_PASSPORT_NUMBER" || "US_SOCIAL_SECURITY_NUMBER" || "VEHICLE_IDENTIFICATION_NUMBER", // required
//                 action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//             regexes: [ // GuardrailRegexFilterList // required
//               { // GuardrailRegexFilter
//                 name: "STRING_VALUE",
//                 match: "STRING_VALUE",
//                 regex: "STRING_VALUE",
//                 action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//           },
//           contextualGroundingPolicy: { // GuardrailContextualGroundingPolicyAssessment
//             filters: [ // GuardrailContextualGroundingFilters
//               { // GuardrailContextualGroundingFilter
//                 type: "GROUNDING" || "RELEVANCE", // required
//                 threshold: Number("double"), // required
//                 score: Number("double"), // required
//                 action: "BLOCKED" || "NONE", // required
//                 detected: true || false,
//               },
//             ],
//           },
//           invocationMetrics: { // GuardrailInvocationMetrics
//             guardrailProcessingLatency: Number("long"),
//             usage: { // GuardrailUsage
//               topicPolicyUnits: Number("int"), // required
//               contentPolicyUnits: Number("int"), // required
//               wordPolicyUnits: Number("int"), // required
//               sensitiveInformationPolicyUnits: Number("int"), // required
//               sensitiveInformationPolicyFreeUnits: Number("int"), // required
//               contextualGroundingPolicyUnits: Number("int"), // required
//               contentPolicyImageUnits: Number("int"),
//             },
//             guardrailCoverage: { // GuardrailCoverage
//               textCharacters: { // GuardrailTextCharactersCoverage
//                 guarded: Number("int"),
//                 total: Number("int"),
//               },
//               images: { // GuardrailImageCoverage
//                 guarded: Number("int"),
//                 total: Number("int"),
//               },
//             },
//           },
//         },
//       },
//       outputAssessments: { // GuardrailAssessmentListMap
//         "<keys>": [ // GuardrailAssessmentList
//           {
//             topicPolicy: {
//               topics: [ // required
//                 {
//                   name: "STRING_VALUE", // required
//                   type: "DENY", // required
//                   action: "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//             },
//             contentPolicy: {
//               filters: [ // required
//                 {
//                   type: "INSULTS" || "HATE" || "SEXUAL" || "VIOLENCE" || "MISCONDUCT" || "PROMPT_ATTACK", // required
//                   confidence: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
//                   filterStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH",
//                   action: "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//             },
//             wordPolicy: {
//               customWords: [ // required
//                 {
//                   match: "STRING_VALUE", // required
//                   action: "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//               managedWordLists: [ // required
//                 {
//                   match: "STRING_VALUE", // required
//                   type: "PROFANITY", // required
//                   action: "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//             },
//             sensitiveInformationPolicy: {
//               piiEntities: [ // required
//                 {
//                   match: "STRING_VALUE", // required
//                   type: "ADDRESS" || "AGE" || "AWS_ACCESS_KEY" || "AWS_SECRET_KEY" || "CA_HEALTH_NUMBER" || "CA_SOCIAL_INSURANCE_NUMBER" || "CREDIT_DEBIT_CARD_CVV" || "CREDIT_DEBIT_CARD_EXPIRY" || "CREDIT_DEBIT_CARD_NUMBER" || "DRIVER_ID" || "EMAIL" || "INTERNATIONAL_BANK_ACCOUNT_NUMBER" || "IP_ADDRESS" || "LICENSE_PLATE" || "MAC_ADDRESS" || "NAME" || "PASSWORD" || "PHONE" || "PIN" || "SWIFT_CODE" || "UK_NATIONAL_HEALTH_SERVICE_NUMBER" || "UK_NATIONAL_INSURANCE_NUMBER" || "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER" || "URL" || "USERNAME" || "US_BANK_ACCOUNT_NUMBER" || "US_BANK_ROUTING_NUMBER" || "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER" || "US_PASSPORT_NUMBER" || "US_SOCIAL_SECURITY_NUMBER" || "VEHICLE_IDENTIFICATION_NUMBER", // required
//                   action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//               regexes: [ // required
//                 {
//                   name: "STRING_VALUE",
//                   match: "STRING_VALUE",
//                   regex: "STRING_VALUE",
//                   action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//             },
//             contextualGroundingPolicy: {
//               filters: [
//                 {
//                   type: "GROUNDING" || "RELEVANCE", // required
//                   threshold: Number("double"), // required
//                   score: Number("double"), // required
//                   action: "BLOCKED" || "NONE", // required
//                   detected: true || false,
//                 },
//               ],
//             },
//             invocationMetrics: {
//               guardrailProcessingLatency: Number("long"),
//               usage: {
//                 topicPolicyUnits: Number("int"), // required
//                 contentPolicyUnits: Number("int"), // required
//                 wordPolicyUnits: Number("int"), // required
//                 sensitiveInformationPolicyUnits: Number("int"), // required
//                 sensitiveInformationPolicyFreeUnits: Number("int"), // required
//                 contextualGroundingPolicyUnits: Number("int"), // required
//                 contentPolicyImageUnits: Number("int"),
//               },
//               guardrailCoverage: {
//                 textCharacters: {
//                   guarded: Number("int"),
//                   total: Number("int"),
//                 },
//                 images: {
//                   guarded: Number("int"),
//                   total: Number("int"),
//                 },
//               },
//             },
//           },
//         ],
//       },
//       actionReason: "STRING_VALUE",
//     },
//     promptRouter: { // PromptRouterTrace
//       invokedModelId: "STRING_VALUE",
//     },
//   },
//   performanceConfig: { // PerformanceConfiguration
//     latency: "standard" || "optimized",
//   },
// };

/* Example Usage: ConverseStreamCommand
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime"; // ES Modules import
// const { BedrockRuntimeClient, ConverseStreamCommand } = require("@aws-sdk/client-bedrock-runtime"); // CommonJS import
const client = new BedrockRuntimeClient(config);
const input = { // ConverseStreamRequest
  modelId: "STRING_VALUE", // required
  messages: [ // Messages
    { // Message
      role: "user" || "assistant", // required
      content: [ // ContentBlocks // required
        { // ContentBlock Union: only one key present
          text: "STRING_VALUE",
          image: { // ImageBlock
            format: "png" || "jpeg" || "gif" || "webp", // required
            source: { // ImageSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: { // S3Location
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
            },
          },
          document: { // DocumentBlock
            format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
            name: "STRING_VALUE", // required
            source: { // DocumentSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: {
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
              text: "STRING_VALUE",
              content: [ // DocumentContentBlocks
                { // DocumentContentBlock Union: only one key present
                  text: "STRING_VALUE",
                },
              ],
            },
            context: "STRING_VALUE",
            citations: { // CitationsConfig
              enabled: true || false, // required
            },
          },
          video: { // VideoBlock
            format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
            source: { // VideoSource Union: only one key present
              bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              s3Location: {
                uri: "STRING_VALUE", // required
                bucketOwner: "STRING_VALUE",
              },
            },
          },
          toolUse: { // ToolUseBlock
            toolUseId: "STRING_VALUE", // required
            name: "STRING_VALUE", // required
            input: "DOCUMENT_VALUE", // required
          },
          toolResult: { // ToolResultBlock
            toolUseId: "STRING_VALUE", // required
            content: [ // ToolResultContentBlocks // required
              { // ToolResultContentBlock Union: only one key present
                json: "DOCUMENT_VALUE",
                text: "STRING_VALUE",
                image: {
                  format: "png" || "jpeg" || "gif" || "webp", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: {
                      uri: "STRING_VALUE", // required
                      bucketOwner: "STRING_VALUE",
                    },
                  },
                },
                document: {
                  format: "pdf" || "csv" || "doc" || "docx" || "xls" || "xlsx" || "html" || "txt" || "md",
                  name: "STRING_VALUE", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: {
                      uri: "STRING_VALUE", // required
                      bucketOwner: "STRING_VALUE",
                    },
                    text: "STRING_VALUE",
                    content: [
                      {//  Union: only one key present
                        text: "STRING_VALUE",
                      },
                    ],
                  },
                  context: "STRING_VALUE",
                  citations: {
                    enabled: true || false, // required
                  },
                },
                video: {
                  format: "mkv" || "mov" || "mp4" || "webm" || "flv" || "mpeg" || "mpg" || "wmv" || "three_gp", // required
                  source: {//  Union: only one key present
                    bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
                    s3Location: "<S3Location>",
                  },
                },
              },
            ],
            status: "success" || "error",
          },
          guardContent: { // GuardrailConverseContentBlock Union: only one key present
            text: { // GuardrailConverseTextBlock
              text: "STRING_VALUE", // required
              qualifiers: [ // GuardrailConverseContentQualifierList
                "grounding_source" || "query" || "guard_content",
              ],
            },
            image: { // GuardrailConverseImageBlock
              format: "png" || "jpeg", // required
              source: { // GuardrailConverseImageSource Union: only one key present
                bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
              },
            },
          },
          cachePoint: { // CachePointBlock
            type: "default", // required
          },
          reasoningContent: { // ReasoningContentBlock Union: only one key present
            reasoningText: { // ReasoningTextBlock
              text: "STRING_VALUE", // required
              signature: "STRING_VALUE",
            },
            redactedContent: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
          },
          citationsContent: { // CitationsContentBlock
            content: [ // CitationGeneratedContentList
              { // CitationGeneratedContent Union: only one key present
                text: "STRING_VALUE",
              },
            ],
            citations: [ // Citations
              { // Citation
                title: "STRING_VALUE",
                sourceContent: [ // CitationSourceContentList
                  { // CitationSourceContent Union: only one key present
                    text: "STRING_VALUE",
                  },
                ],
                location: { // CitationLocation Union: only one key present
                  documentChar: { // DocumentCharLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                  documentPage: { // DocumentPageLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                  documentChunk: { // DocumentChunkLocation
                    documentIndex: Number("int"),
                    start: Number("int"),
                    end: Number("int"),
                  },
                },
              },
            ],
          },
        },
      ],
    },
  ],
  system: [ // SystemContentBlocks
    { // SystemContentBlock Union: only one key present
      text: "STRING_VALUE",
      guardContent: {//  Union: only one key present
        text: {
          text: "STRING_VALUE", // required
          qualifiers: [
            "grounding_source" || "query" || "guard_content",
          ],
        },
        image: {
          format: "png" || "jpeg", // required
          source: {//  Union: only one key present
            bytes: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
          },
        },
      },
      cachePoint: {
        type: "default", // required
      },
    },
  ],
  inferenceConfig: { // InferenceConfiguration
    maxTokens: Number("int"),
    temperature: Number("float"),
    topP: Number("float"),
    stopSequences: [ // NonEmptyStringList
      "STRING_VALUE",
    ],
  },
  toolConfig: { // ToolConfiguration
    tools: [ // Tools // required
      { // Tool Union: only one key present
        toolSpec: { // ToolSpecification
          name: "STRING_VALUE", // required
          description: "STRING_VALUE",
          inputSchema: { // ToolInputSchema Union: only one key present
            json: "DOCUMENT_VALUE",
          },
        },
        cachePoint: "<CachePointBlock>",
      },
    ],
    toolChoice: { // ToolChoice Union: only one key present
      auto: {},
      any: {},
      tool: { // SpecificToolChoice
        name: "STRING_VALUE", // required
      },
    },
  },
  guardrailConfig: { // GuardrailStreamConfiguration
    guardrailIdentifier: "STRING_VALUE", // required
    guardrailVersion: "STRING_VALUE", // required
    trace: "enabled" || "disabled" || "enabled_full",
    streamProcessingMode: "sync" || "async",
  },
  additionalModelRequestFields: "DOCUMENT_VALUE",
  promptVariables: { // PromptVariableMap
    "<keys>": { // PromptVariableValues Union: only one key present
      text: "STRING_VALUE",
    },
  },
  additionalModelResponseFieldPaths: [ // AdditionalModelResponseFieldPaths
    "STRING_VALUE",
  ],
  requestMetadata: { // RequestMetadata
    "<keys>": "STRING_VALUE",
  },
  performanceConfig: { // PerformanceConfiguration
    latency: "standard" || "optimized",
  },
};
const command = new ConverseStreamCommand(input);
const response = await client.send(command);
*/
// { // ConverseStreamResponse
//   stream: { // ConverseStreamOutput Union: only one key present
//     messageStart: { // MessageStartEvent
//       role: "user" || "assistant", // required
//     },
//     contentBlockStart: { // ContentBlockStartEvent
//       start: { // ContentBlockStart Union: only one key present
//         toolUse: { // ToolUseBlockStart
//           toolUseId: "STRING_VALUE", // required
//           name: "STRING_VALUE", // required
//         },
//       },
//       contentBlockIndex: Number("int"), // required
//     },
//     contentBlockDelta: { // ContentBlockDeltaEvent
//       delta: { // ContentBlockDelta Union: only one key present
//         text: "STRING_VALUE",
//         toolUse: { // ToolUseBlockDelta
//           input: "STRING_VALUE", // required
//         },
//         reasoningContent: { // ReasoningContentBlockDelta Union: only one key present
//           text: "STRING_VALUE",
//           redactedContent: new Uint8Array(),
//           signature: "STRING_VALUE",
//         },
//         citation: { // CitationsDelta
//           title: "STRING_VALUE",
//           sourceContent: [ // CitationSourceContentListDelta
//             { // CitationSourceContentDelta
//               text: "STRING_VALUE",
//             },
//           ],
//           location: { // CitationLocation Union: only one key present
//             documentChar: { // DocumentCharLocation
//               documentIndex: Number("int"),
//               start: Number("int"),
//               end: Number("int"),
//             },
//             documentPage: { // DocumentPageLocation
//               documentIndex: Number("int"),
//               start: Number("int"),
//               end: Number("int"),
//             },
//             documentChunk: { // DocumentChunkLocation
//               documentIndex: Number("int"),
//               start: Number("int"),
//               end: Number("int"),
//             },
//           },
//         },
//       },
//       contentBlockIndex: Number("int"), // required
//     },
//     contentBlockStop: { // ContentBlockStopEvent
//       contentBlockIndex: Number("int"), // required
//     },
//     messageStop: { // MessageStopEvent
//       stopReason: "end_turn" || "tool_use" || "max_tokens" || "stop_sequence" || "guardrail_intervened" || "content_filtered", // required
//       additionalModelResponseFields: "DOCUMENT_VALUE",
//     },
//     metadata: { // ConverseStreamMetadataEvent
//       usage: { // TokenUsage
//         inputTokens: Number("int"), // required
//         outputTokens: Number("int"), // required
//         totalTokens: Number("int"), // required
//         cacheReadInputTokens: Number("int"),
//         cacheWriteInputTokens: Number("int"),
//       },
//       metrics: { // ConverseStreamMetrics
//         latencyMs: Number("long"), // required
//       },
//       trace: { // ConverseStreamTrace
//         guardrail: { // GuardrailTraceAssessment
//           modelOutput: [ // ModelOutputs
//             "STRING_VALUE",
//           ],
//           inputAssessment: { // GuardrailAssessmentMap
//             "<keys>": { // GuardrailAssessment
//               topicPolicy: { // GuardrailTopicPolicyAssessment
//                 topics: [ // GuardrailTopicList // required
//                   { // GuardrailTopic
//                     name: "STRING_VALUE", // required
//                     type: "DENY", // required
//                     action: "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//               },
//               contentPolicy: { // GuardrailContentPolicyAssessment
//                 filters: [ // GuardrailContentFilterList // required
//                   { // GuardrailContentFilter
//                     type: "INSULTS" || "HATE" || "SEXUAL" || "VIOLENCE" || "MISCONDUCT" || "PROMPT_ATTACK", // required
//                     confidence: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
//                     filterStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH",
//                     action: "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//               },
//               wordPolicy: { // GuardrailWordPolicyAssessment
//                 customWords: [ // GuardrailCustomWordList // required
//                   { // GuardrailCustomWord
//                     match: "STRING_VALUE", // required
//                     action: "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//                 managedWordLists: [ // GuardrailManagedWordList // required
//                   { // GuardrailManagedWord
//                     match: "STRING_VALUE", // required
//                     type: "PROFANITY", // required
//                     action: "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//               },
//               sensitiveInformationPolicy: { // GuardrailSensitiveInformationPolicyAssessment
//                 piiEntities: [ // GuardrailPiiEntityFilterList // required
//                   { // GuardrailPiiEntityFilter
//                     match: "STRING_VALUE", // required
//                     type: "ADDRESS" || "AGE" || "AWS_ACCESS_KEY" || "AWS_SECRET_KEY" || "CA_HEALTH_NUMBER" || "CA_SOCIAL_INSURANCE_NUMBER" || "CREDIT_DEBIT_CARD_CVV" || "CREDIT_DEBIT_CARD_EXPIRY" || "CREDIT_DEBIT_CARD_NUMBER" || "DRIVER_ID" || "EMAIL" || "INTERNATIONAL_BANK_ACCOUNT_NUMBER" || "IP_ADDRESS" || "LICENSE_PLATE" || "MAC_ADDRESS" || "NAME" || "PASSWORD" || "PHONE" || "PIN" || "SWIFT_CODE" || "UK_NATIONAL_HEALTH_SERVICE_NUMBER" || "UK_NATIONAL_INSURANCE_NUMBER" || "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER" || "URL" || "USERNAME" || "US_BANK_ACCOUNT_NUMBER" || "US_BANK_ROUTING_NUMBER" || "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER" || "US_PASSPORT_NUMBER" || "US_SOCIAL_SECURITY_NUMBER" || "VEHICLE_IDENTIFICATION_NUMBER", // required
//                     action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//                 regexes: [ // GuardrailRegexFilterList // required
//                   { // GuardrailRegexFilter
//                     name: "STRING_VALUE",
//                     match: "STRING_VALUE",
//                     regex: "STRING_VALUE",
//                     action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//               },
//               contextualGroundingPolicy: { // GuardrailContextualGroundingPolicyAssessment
//                 filters: [ // GuardrailContextualGroundingFilters
//                   { // GuardrailContextualGroundingFilter
//                     type: "GROUNDING" || "RELEVANCE", // required
//                     threshold: Number("double"), // required
//                     score: Number("double"), // required
//                     action: "BLOCKED" || "NONE", // required
//                     detected: true || false,
//                   },
//                 ],
//               },
//               invocationMetrics: { // GuardrailInvocationMetrics
//                 guardrailProcessingLatency: Number("long"),
//                 usage: { // GuardrailUsage
//                   topicPolicyUnits: Number("int"), // required
//                   contentPolicyUnits: Number("int"), // required
//                   wordPolicyUnits: Number("int"), // required
//                   sensitiveInformationPolicyUnits: Number("int"), // required
//                   sensitiveInformationPolicyFreeUnits: Number("int"), // required
//                   contextualGroundingPolicyUnits: Number("int"), // required
//                   contentPolicyImageUnits: Number("int"),
//                 },
//                 guardrailCoverage: { // GuardrailCoverage
//                   textCharacters: { // GuardrailTextCharactersCoverage
//                     guarded: Number("int"),
//                     total: Number("int"),
//                   },
//                   images: { // GuardrailImageCoverage
//                     guarded: Number("int"),
//                     total: Number("int"),
//                   },
//                 },
//               },
//             },
//           },
//           outputAssessments: { // GuardrailAssessmentListMap
//             "<keys>": [ // GuardrailAssessmentList
//               {
//                 topicPolicy: {
//                   topics: [ // required
//                     {
//                       name: "STRING_VALUE", // required
//                       type: "DENY", // required
//                       action: "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                 },
//                 contentPolicy: {
//                   filters: [ // required
//                     {
//                       type: "INSULTS" || "HATE" || "SEXUAL" || "VIOLENCE" || "MISCONDUCT" || "PROMPT_ATTACK", // required
//                       confidence: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
//                       filterStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH",
//                       action: "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                 },
//                 wordPolicy: {
//                   customWords: [ // required
//                     {
//                       match: "STRING_VALUE", // required
//                       action: "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                   managedWordLists: [ // required
//                     {
//                       match: "STRING_VALUE", // required
//                       type: "PROFANITY", // required
//                       action: "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                 },
//                 sensitiveInformationPolicy: {
//                   piiEntities: [ // required
//                     {
//                       match: "STRING_VALUE", // required
//                       type: "ADDRESS" || "AGE" || "AWS_ACCESS_KEY" || "AWS_SECRET_KEY" || "CA_HEALTH_NUMBER" || "CA_SOCIAL_INSURANCE_NUMBER" || "CREDIT_DEBIT_CARD_CVV" || "CREDIT_DEBIT_CARD_EXPIRY" || "CREDIT_DEBIT_CARD_NUMBER" || "DRIVER_ID" || "EMAIL" || "INTERNATIONAL_BANK_ACCOUNT_NUMBER" || "IP_ADDRESS" || "LICENSE_PLATE" || "MAC_ADDRESS" || "NAME" || "PASSWORD" || "PHONE" || "PIN" || "SWIFT_CODE" || "UK_NATIONAL_HEALTH_SERVICE_NUMBER" || "UK_NATIONAL_INSURANCE_NUMBER" || "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER" || "URL" || "USERNAME" || "US_BANK_ACCOUNT_NUMBER" || "US_BANK_ROUTING_NUMBER" || "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER" || "US_PASSPORT_NUMBER" || "US_SOCIAL_SECURITY_NUMBER" || "VEHICLE_IDENTIFICATION_NUMBER", // required
//                       action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                   regexes: [ // required
//                     {
//                       name: "STRING_VALUE",
//                       match: "STRING_VALUE",
//                       regex: "STRING_VALUE",
//                       action: "ANONYMIZED" || "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                 },
//                 contextualGroundingPolicy: {
//                   filters: [
//                     {
//                       type: "GROUNDING" || "RELEVANCE", // required
//                       threshold: Number("double"), // required
//                       score: Number("double"), // required
//                       action: "BLOCKED" || "NONE", // required
//                       detected: true || false,
//                     },
//                   ],
//                 },
//                 invocationMetrics: {
//                   guardrailProcessingLatency: Number("long"),
//                   usage: {
//                     topicPolicyUnits: Number("int"), // required
//                     contentPolicyUnits: Number("int"), // required
//                     wordPolicyUnits: Number("int"), // required
//                     sensitiveInformationPolicyUnits: Number("int"), // required
//                     sensitiveInformationPolicyFreeUnits: Number("int"), // required
//                     contextualGroundingPolicyUnits: Number("int"), // required
//                     contentPolicyImageUnits: Number("int"),
//                   },
//                   guardrailCoverage: {
//                     textCharacters: {
//                       guarded: Number("int"),
//                       total: Number("int"),
//                     },
//                     images: {
//                       guarded: Number("int"),
//                       total: Number("int"),
//                     },
//                   },
//                 },
//               },
//             ],
//           },
//           actionReason: "STRING_VALUE",
//         },
//         promptRouter: { // PromptRouterTrace
//           invokedModelId: "STRING_VALUE",
//         },
//       },
//       performanceConfig: { // PerformanceConfiguration
//         latency: "standard" || "optimized",
//       },
//     },
//     internalServerException: { // InternalServerException
//       message: "STRING_VALUE",
//     },
//     modelStreamErrorException: { // ModelStreamErrorException
//       message: "STRING_VALUE",
//       originalStatusCode: Number("int"),
//       originalMessage: "STRING_VALUE",
//     },
//     validationException: { // ValidationException
//       message: "STRING_VALUE",
//     },
//     throttlingException: { // ThrottlingException
//       message: "STRING_VALUE",
//     },
//     serviceUnavailableException: { // ServiceUnavailableException
//       message: "STRING_VALUE",
//     },
//   },
// };

export default class BedrockProvider {
  constructor() {
    this.client = new BedrockRuntimeClient();
  }

  /**
   * Sends a non-streaming Converse request to AWS Bedrock.
   * @param {import("@aws-sdk/client-bedrock-runtime").ConverseCommandInput>} input - The Bedrock ConverseRequest payload. (e.g., { modelId, messages, system, toolConfig, inferenceConfig })
   * @returns {Promise<import("@aws-sdk/client-bedrock-runtime").ConverseCommandOutput>} The full response from the Bedrock Converse API.
   */
  async converse(input) {
    const command = new ConverseCommand(input);
    return await this.client.send(command);
  }

  /**
   * Sends a streaming Converse request to AWS Bedrock.
   * @param {import("@aws-sdk/client-bedrock-runtime").ConverseCommandInput} input - The Bedrock ConverseRequest payload.
   * @returns {AsyncGenerator<import("@aws-sdk/client-bedrock-runtime").ConverseStreamOutput>} An async generator yielding Bedrock ConverseStreamOutput events.
   */
  async converseStream(input) {
    const command = new ConverseStreamCommand(input);
    return await this.client.send(command);
  }
}
