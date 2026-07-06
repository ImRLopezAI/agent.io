/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  api: {
    agents: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          archived?: boolean;
          audio?: {
            input: {
              format: "pcm16" | "g711_ulaw" | "g711_alaw";
              transcription?: boolean;
            };
            output: {
              format: "pcm16" | "g711_ulaw" | "g711_alaw";
              speed?: number;
            };
          };
          dynamicVariableDefaults?: Record<string, string>;
          instructions?: string;
          knowledgeBase?: Array<{
            documentId: string;
            usageMode: "auto" | "prompt";
          }>;
          mcp?: Array<{
            connectionId: string;
            requireApproval?: "never" | "always";
            toolkits?:
              | { mode: "enable"; values: Array<string> }
              | { mode: "disable"; values: Array<string> };
            tools?: Record<
              string,
              | { mode: "enable"; values: Array<string> }
              | { mode: "disable"; values: Array<string> }
            >;
          }>;
          model: { model: string; provider: "openai" | "xai" };
          name: string;
          systemTools?: {
            end_call?: { enabled: boolean };
            language_detection?: { enabled: boolean };
            play_keypad_touch_tone?: { enabled: boolean };
            skip_turn?: { enabled: boolean };
            transfer_to_agent?: {
              enabled: boolean;
              transfers: Array<{ agentId: string; condition: string }>;
            };
            transfer_to_number?: {
              enabled: boolean;
              transfers: Array<{ condition: string; target: string }>;
            };
            voicemail_detection?: {
              enabled: boolean;
              voicemailMessage?: string;
            };
          };
          vad:
            | { idleTimeoutMs?: number; mode: "server_vad"; silenceMs?: number }
            | { eagerness?: "low" | "medium" | "high"; mode: "semantic_vad" }
            | { mode: "manual" };
          voice: string;
        },
        any
      >;
      get: FunctionReference<"query", "public", { id: string }, any>;
      list: FunctionReference<"query", "public", {}, any>;
      publish: FunctionReference<"mutation", "public", { id: string }, any>;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            archived?: boolean;
            audio?: {
              input: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                transcription?: boolean;
              };
              output: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                speed?: number;
              };
            };
            dynamicVariableDefaults?: Record<string, string>;
            instructions?: string;
            knowledgeBase?: Array<{
              documentId: string;
              usageMode: "auto" | "prompt";
            }>;
            mcp?: Array<{
              connectionId: string;
              requireApproval?: "never" | "always";
              toolkits?:
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> };
              tools?: Record<
                string,
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> }
              >;
            }>;
            model?: { model: string; provider: "openai" | "xai" };
            name?: string;
            systemTools?: {
              end_call?: { enabled: boolean };
              language_detection?: { enabled: boolean };
              play_keypad_touch_tone?: { enabled: boolean };
              skip_turn?: { enabled: boolean };
              transfer_to_agent?: {
                enabled: boolean;
                transfers: Array<{ agentId: string; condition: string }>;
              };
              transfer_to_number?: {
                enabled: boolean;
                transfers: Array<{ condition: string; target: string }>;
              };
              voicemail_detection?: {
                enabled: boolean;
                voicemailMessage?: string;
              };
            };
            vad?:
              | {
                  idleTimeoutMs?: number;
                  mode: "server_vad";
                  silenceMs?: number;
                }
              | { eagerness?: "low" | "medium" | "high"; mode: "semantic_vad" }
              | { mode: "manual" };
            voice?: string;
          };
        },
        any
      >;
    };
    conversations: {
      list: FunctionReference<"query", "public", { status?: string }, any>;
      messages: FunctionReference<
        "query",
        "public",
        { conversationId: string },
        any
      >;
      searchTranscripts: FunctionReference<
        "query",
        "public",
        { conversationId?: string; text: string },
        any
      >;
    };
    knowledgeBase: {
      createDocument: FunctionReference<
        "mutation",
        "public",
        {
          content?: string;
          name: string;
          sourceUrl?: string;
          storageId?: string;
          type: "text" | "url" | "file";
          usageMode?: "auto" | "prompt";
        },
        any
      >;
      listDocuments: FunctionReference<"query", "public", {}, any>;
      removeDocument: FunctionReference<
        "mutation",
        "public",
        { id: string },
        any
      >;
    };
    mcpConnections: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          allowedTools?: Array<string>;
          approvalPolicy?:
            | "auto_approve_all"
            | "require_approval_all"
            | "require_approval_per_tool";
          composioAccountId?: string;
          description?: string;
          kind: "composio" | "byo";
          name: string;
          requestHeaders?: Record<string, string | { secretRef: string }>;
          responseTimeoutSecs?: number;
          secretRef?: string;
          status?: "active" | "disabled" | "error";
          toolApprovals?: Array<{
            policy: "auto_approved" | "requires_approval";
            toolHash: string;
            toolName: string;
          }>;
          toolConfigOverrides?: Array<{
            inputOverrides?: Record<
              string,
              | { source: "constant"; value: string }
              | { name: string; source: "dynamic_variable" }
              | { prompt?: string; source: "llm" }
              | { source: "omit" }
            >;
            toolName: string;
          }>;
          toolkitSlugs?: Array<string>;
          transport?: "sse" | "streamable_http";
          url?: string;
        },
        any
      >;
      list: FunctionReference<"query", "public", {}, any>;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            allowedTools?: Array<string>;
            approvalPolicy?:
              | "auto_approve_all"
              | "require_approval_all"
              | "require_approval_per_tool";
            composioAccountId?: string;
            description?: string;
            name?: string;
            requestHeaders?: Record<string, string | { secretRef: string }>;
            responseTimeoutSecs?: number;
            secretRef?: string;
            status?: "active" | "disabled" | "error";
            toolApprovals?: Array<{
              policy: "auto_approved" | "requires_approval";
              toolHash: string;
              toolName: string;
            }>;
            toolConfigOverrides?: Array<{
              inputOverrides?: Record<
                string,
                | { source: "constant"; value: string }
                | { name: string; source: "dynamic_variable" }
                | { prompt?: string; source: "llm" }
                | { source: "omit" }
              >;
              toolName: string;
            }>;
            toolkitSlugs?: Array<string>;
            transport?: "sse" | "streamable_http";
            url?: string;
          };
        },
        any
      >;
    };
    procedures: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          agentId: Id<"agents">;
          content?: string;
          name: string;
          references?: Array<{
            health?: "valid" | "invalid" | "unavailable";
            location: "trigger" | "content";
            targetId: string;
            targetType:
              "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
          }>;
          source?: "manual" | "sop_import" | "generated";
          status?: "draft" | "active" | "archived";
          steps?: Array<
            | { instruction: string; type: "ask" }
            | { instruction: string; type: "tell" }
            | { text: string; type: "say" }
            | { instruction?: string; toolRef: string; type: "tool" }
            | {
                condition:
                  | { description: string; kind: "natural_language" }
                  | { expression: string; kind: "expression" };
                steps: Array<
                  | { instruction: string; type: "ask" }
                  | { instruction: string; type: "tell" }
                  | { text: string; type: "say" }
                  | { instruction?: string; toolRef: string; type: "tool" }
                >;
                type: "if";
              }
          >;
          trigger: string;
          type: "free_form" | "structured";
        },
        any
      >;
      listByAgent: FunctionReference<
        "query",
        "public",
        { agentId: string },
        any
      >;
      remove: FunctionReference<"mutation", "public", { id: string }, any>;
      update: FunctionReference<
        "mutation",
        "public",
        {
          id: string;
          patch: {
            content?: string;
            name?: string;
            references?: Array<{
              health?: "valid" | "invalid" | "unavailable";
              location: "trigger" | "content";
              targetId: string;
              targetType:
                "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
            }>;
            source?: "manual" | "sop_import" | "generated";
            status?: "draft" | "active" | "archived";
            steps?: Array<
              | { instruction: string; type: "ask" }
              | { instruction: string; type: "tell" }
              | { text: string; type: "say" }
              | { instruction?: string; toolRef: string; type: "tool" }
              | {
                  condition:
                    | { description: string; kind: "natural_language" }
                    | { expression: string; kind: "expression" };
                  steps: Array<
                    | { instruction: string; type: "ask" }
                    | { instruction: string; type: "tell" }
                    | { text: string; type: "say" }
                    | { instruction?: string; toolRef: string; type: "tool" }
                  >;
                  type: "if";
                }
            >;
            trigger?: string;
          };
        },
        any
      >;
    };
    tenantSettings: {
      get: FunctionReference<"query", "public", {}, any>;
      patch: FunctionReference<
        "mutation",
        "public",
        {
          concurrencyLimit?: number;
          dailyCallLimit?: number;
          recordingEnabled?: boolean;
          transcriptRetentionDays?: number;
        },
        any
      >;
    };
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  api: {
    conversations: {
      appendMessage: FunctionReference<
        "mutation",
        "internal",
        {
          audioStorageId?: string;
          interrupted?: boolean;
          ownerId: Id<"conversations">;
          role: "user" | "agent" | "system";
          text?: string;
          timeInCallSecs?: number;
          toolCalls?: Array<{ argsJson: string; callId: string; name: string }>;
          toolResults?: Array<{
            callId: string;
            isError?: boolean;
            latencyMs?: number;
            output: string;
          }>;
        },
        any
      >;
      finish: FunctionReference<
        "mutation",
        "internal",
        {
          durationSecs?: number;
          ownerId: Id<"conversations">;
          status: "done" | "failed";
          terminationReason?: string;
          usage?: {
            costUsd?: number;
            inputTokens: number;
            outputTokens: number;
          };
        },
        any
      >;
      startFromPhoneNumber: FunctionReference<
        "mutation",
        "internal",
        {
          agentVersionId: string;
          channel:
            "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
          direction: "inbound" | "outbound";
          externalNumber?: string;
          ownerId: Id<"phoneNumbers">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
      startFromVersion: FunctionReference<
        "mutation",
        "internal",
        {
          channel:
            "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
          direction: "inbound" | "outbound";
          externalNumber?: string;
          ownerId: Id<"agentVersions">;
          provider: "openai" | "xai";
          providerSessionId?: string;
        },
        any
      >;
    };
    internals: {
      agents: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"agents">;
            archived?: boolean;
            audio?: {
              input: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                transcription?: boolean;
              };
              output: {
                format: "pcm16" | "g711_ulaw" | "g711_alaw";
                speed?: number;
              };
            };
            createdAt: string;
            dynamicVariableDefaults?: Record<string, string>;
            instructions?: string;
            knowledgeBase?: Array<{
              documentId: string;
              usageMode: "auto" | "prompt";
            }>;
            mcp?: Array<{
              connectionId: string;
              requireApproval?: "never" | "always";
              toolkits?:
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> };
              tools?: Record<
                string,
                | { mode: "enable"; values: Array<string> }
                | { mode: "disable"; values: Array<string> }
              >;
            }>;
            model: { model: string; provider: "openai" | "xai" };
            name: string;
            publishedVersionId?: Id<"agentVersions">;
            systemTools?: {
              end_call?: { enabled: boolean };
              language_detection?: { enabled: boolean };
              play_keypad_touch_tone?: { enabled: boolean };
              skip_turn?: { enabled: boolean };
              transfer_to_agent?: {
                enabled: boolean;
                transfers: Array<{ agentId: string; condition: string }>;
              };
              transfer_to_number?: {
                enabled: boolean;
                transfers: Array<{ condition: string; target: string }>;
              };
              voicemail_detection?: {
                enabled: boolean;
                voicemailMessage?: string;
              };
            };
            tenant: string;
            updatedAt?: string;
            vad:
              | {
                  idleTimeoutMs?: number;
                  mode: "server_vad";
                  silenceMs?: number;
                }
              | { eagerness?: "low" | "medium" | "high"; mode: "semantic_vad" }
              | { mode: "manual" };
            voice: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"agents"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<"query", "internal", { id: Id<"agents"> }, any>;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"agents">;
            patch: {
              _creationTime?: number;
              _id?: Id<"agents">;
              archived?: boolean;
              audio?: {
                input: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  transcription?: boolean;
                };
                output: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  speed?: number;
                };
              };
              createdAt?: string;
              dynamicVariableDefaults?: Record<string, string>;
              instructions?: string;
              knowledgeBase?: Array<{
                documentId: string;
                usageMode: "auto" | "prompt";
              }>;
              mcp?: Array<{
                connectionId: string;
                requireApproval?: "never" | "always";
                toolkits?:
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> };
                tools?: Record<
                  string,
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> }
                >;
              }>;
              model?: { model: string; provider: "openai" | "xai" };
              name?: string;
              publishedVersionId?: Id<"agentVersions">;
              systemTools?: {
                end_call?: { enabled: boolean };
                language_detection?: { enabled: boolean };
                play_keypad_touch_tone?: { enabled: boolean };
                skip_turn?: { enabled: boolean };
                transfer_to_agent?: {
                  enabled: boolean;
                  transfers: Array<{ agentId: string; condition: string }>;
                };
                transfer_to_number?: {
                  enabled: boolean;
                  transfers: Array<{ condition: string; target: string }>;
                };
                voicemail_detection?: {
                  enabled: boolean;
                  voicemailMessage?: string;
                };
              };
              tenant?: string;
              updatedAt?: string;
              vad?:
                | {
                    idleTimeoutMs?: number;
                    mode: "server_vad";
                    silenceMs?: number;
                  }
                | {
                    eagerness?: "low" | "medium" | "high";
                    mode: "semantic_vad";
                  }
                | { mode: "manual" };
              voice?: string;
            };
          },
          any
        >;
      };
      agentVersions: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"agentVersions">;
            agentId: Id<"agents">;
            config: {
              audio?: {
                input: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  transcription?: boolean;
                };
                output: {
                  format: "pcm16" | "g711_ulaw" | "g711_alaw";
                  speed?: number;
                };
              };
              dynamicVariableDefaults?: Record<string, string>;
              instructions?: string;
              knowledgeBase?: Array<{
                documentId: string;
                usageMode: "auto" | "prompt";
              }>;
              mcp?: Array<{
                connectionId: string;
                requireApproval?: "never" | "always";
                toolkits?:
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> };
                tools?: Record<
                  string,
                  | { mode: "enable"; values: Array<string> }
                  | { mode: "disable"; values: Array<string> }
                >;
              }>;
              model: { model: string; provider: "openai" | "xai" };
              name: string;
              procedures:
                | {
                    items: Array<{
                      content?: string;
                      name: string;
                      references: Array<{
                        health?: "valid" | "invalid" | "unavailable";
                        location: "trigger" | "content";
                        targetId: string;
                        targetType:
                          | "system_tool"
                          | "mcp_tool"
                          | "knowledge_base"
                          | "procedure";
                      }>;
                      sourceProcedureId: string;
                      steps?: Array<
                        | { instruction: string; type: "ask" }
                        | { instruction: string; type: "tell" }
                        | { text: string; type: "say" }
                        | {
                            instruction?: string;
                            toolRef: string;
                            type: "tool";
                          }
                        | {
                            condition:
                              | {
                                  description: string;
                                  kind: "natural_language";
                                }
                              | { expression: string; kind: "expression" };
                            steps: Array<
                              | { instruction: string; type: "ask" }
                              | { instruction: string; type: "tell" }
                              | { text: string; type: "say" }
                              | {
                                  instruction?: string;
                                  toolRef: string;
                                  type: "tool";
                                }
                            >;
                            type: "if";
                          }
                      >;
                      trigger: string;
                      type: "free_form" | "structured";
                    }>;
                    kind: "inline";
                  }
                | { kind: "refs"; procedureVersionIds: Array<string> };
              systemTools?: {
                end_call?: { enabled: boolean };
                language_detection?: { enabled: boolean };
                play_keypad_touch_tone?: { enabled: boolean };
                skip_turn?: { enabled: boolean };
                transfer_to_agent?: {
                  enabled: boolean;
                  transfers: Array<{ agentId: string; condition: string }>;
                };
                transfer_to_number?: {
                  enabled: boolean;
                  transfers: Array<{ condition: string; target: string }>;
                };
                voicemail_detection?: {
                  enabled: boolean;
                  voicemailMessage?: string;
                };
              };
              vad:
                | {
                    idleTimeoutMs?: number;
                    mode: "server_vad";
                    silenceMs?: number;
                  }
                | {
                    eagerness?: "low" | "medium" | "high";
                    mode: "semantic_vad";
                  }
                | { mode: "manual" };
              voice: string;
            };
            createdAt: string;
            publishedBy: string;
            tenant: string;
            updatedAt?: string;
            version: number;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"agentVersions"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"agentVersions"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"agentVersions">;
            patch: {
              _creationTime?: number;
              _id?: Id<"agentVersions">;
              agentId?: Id<"agents">;
              config?: {
                audio?: {
                  input: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    transcription?: boolean;
                  };
                  output: {
                    format: "pcm16" | "g711_ulaw" | "g711_alaw";
                    speed?: number;
                  };
                };
                dynamicVariableDefaults?: Record<string, string>;
                instructions?: string;
                knowledgeBase?: Array<{
                  documentId: string;
                  usageMode: "auto" | "prompt";
                }>;
                mcp?: Array<{
                  connectionId: string;
                  requireApproval?: "never" | "always";
                  toolkits?:
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> };
                  tools?: Record<
                    string,
                    | { mode: "enable"; values: Array<string> }
                    | { mode: "disable"; values: Array<string> }
                  >;
                }>;
                model: { model: string; provider: "openai" | "xai" };
                name: string;
                procedures:
                  | {
                      items: Array<{
                        content?: string;
                        name: string;
                        references: Array<{
                          health?: "valid" | "invalid" | "unavailable";
                          location: "trigger" | "content";
                          targetId: string;
                          targetType:
                            | "system_tool"
                            | "mcp_tool"
                            | "knowledge_base"
                            | "procedure";
                        }>;
                        sourceProcedureId: string;
                        steps?: Array<
                          | { instruction: string; type: "ask" }
                          | { instruction: string; type: "tell" }
                          | { text: string; type: "say" }
                          | {
                              instruction?: string;
                              toolRef: string;
                              type: "tool";
                            }
                          | {
                              condition:
                                | {
                                    description: string;
                                    kind: "natural_language";
                                  }
                                | { expression: string; kind: "expression" };
                              steps: Array<
                                | { instruction: string; type: "ask" }
                                | { instruction: string; type: "tell" }
                                | { text: string; type: "say" }
                                | {
                                    instruction?: string;
                                    toolRef: string;
                                    type: "tool";
                                  }
                              >;
                              type: "if";
                            }
                        >;
                        trigger: string;
                        type: "free_form" | "structured";
                      }>;
                      kind: "inline";
                    }
                  | { kind: "refs"; procedureVersionIds: Array<string> };
                systemTools?: {
                  end_call?: { enabled: boolean };
                  language_detection?: { enabled: boolean };
                  play_keypad_touch_tone?: { enabled: boolean };
                  skip_turn?: { enabled: boolean };
                  transfer_to_agent?: {
                    enabled: boolean;
                    transfers: Array<{ agentId: string; condition: string }>;
                  };
                  transfer_to_number?: {
                    enabled: boolean;
                    transfers: Array<{ condition: string; target: string }>;
                  };
                  voicemail_detection?: {
                    enabled: boolean;
                    voicemailMessage?: string;
                  };
                };
                vad:
                  | {
                      idleTimeoutMs?: number;
                      mode: "server_vad";
                      silenceMs?: number;
                    }
                  | {
                      eagerness?: "low" | "medium" | "high";
                      mode: "semantic_vad";
                    }
                  | { mode: "manual" };
                voice: string;
              };
              createdAt?: string;
              publishedBy?: string;
              tenant?: string;
              updatedAt?: string;
              version?: number;
            };
          },
          any
        >;
      };
      batchCallJobs: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"batchCallJobs">;
            agentId: Id<"agents">;
            agentVersionId?: Id<"agentVersions">;
            createdAt: string;
            name: string;
            phoneNumberId: Id<"phoneNumbers">;
            ringingTimeoutSecs?: number;
            scheduledAt?: string;
            status:
              "pending" | "in_progress" | "completed" | "failed" | "cancelled";
            targetConcurrency?: number;
            tenant: string;
            timezone?: string;
            totalDispatched?: number;
            totalFinished?: number;
            totalScheduled?: number;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"batchCallJobs"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"batchCallJobs"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"batchCallJobs">;
            patch: {
              _creationTime?: number;
              _id?: Id<"batchCallJobs">;
              agentId?: Id<"agents">;
              agentVersionId?: Id<"agentVersions">;
              createdAt?: string;
              name?: string;
              phoneNumberId?: Id<"phoneNumbers">;
              ringingTimeoutSecs?: number;
              scheduledAt?: string;
              status?:
                | "pending"
                | "in_progress"
                | "completed"
                | "failed"
                | "cancelled";
              targetConcurrency?: number;
              tenant?: string;
              timezone?: string;
              totalDispatched?: number;
              totalFinished?: number;
              totalScheduled?: number;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      batchCallRecipients: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"batchCallRecipients">;
            batchId: Id<"batchCallJobs">;
            conversationId?: Id<"conversations">;
            createdAt: string;
            dynamicVariables?: Record<string, string>;
            phoneNumber: string;
            status:
              | "pending"
              | "dispatched"
              | "initiated"
              | "in_progress"
              | "completed"
              | "failed"
              | "cancelled"
              | "voicemail";
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"batchCallRecipients"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"batchCallRecipients"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"batchCallRecipients">;
            patch: {
              _creationTime?: number;
              _id?: Id<"batchCallRecipients">;
              batchId?: Id<"batchCallJobs">;
              conversationId?: Id<"conversations">;
              createdAt?: string;
              dynamicVariables?: Record<string, string>;
              phoneNumber?: string;
              status?:
                | "pending"
                | "dispatched"
                | "initiated"
                | "in_progress"
                | "completed"
                | "failed"
                | "cancelled"
                | "voicemail";
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      composioSessions: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"composioSessions">;
            configHash: string;
            connectionId: Id<"mcpConnections">;
            createdAt: string;
            sessionId: string;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"composioSessions"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"composioSessions"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"composioSessions">;
            patch: {
              _creationTime?: number;
              _id?: Id<"composioSessions">;
              configHash?: string;
              connectionId?: Id<"mcpConnections">;
              createdAt?: string;
              sessionId?: string;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      conversationMessages: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"conversationMessages">;
            agentId: Id<"agents">;
            audioStorageId?: string;
            conversationId: Id<"conversations">;
            createdAt: string;
            interrupted?: boolean;
            role: "user" | "agent" | "system";
            sequence: number;
            tenant: string;
            text?: string;
            timeInCallSecs?: number;
            toolCalls?: Array<{
              argsJson: string;
              callId: string;
              name: string;
            }>;
            toolResults?: Array<{
              callId: string;
              isError?: boolean;
              latencyMs?: number;
              output: string;
            }>;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"conversationMessages"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"conversationMessages"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"conversationMessages">;
            patch: {
              _creationTime?: number;
              _id?: Id<"conversationMessages">;
              agentId?: Id<"agents">;
              audioStorageId?: string;
              conversationId?: Id<"conversations">;
              createdAt?: string;
              interrupted?: boolean;
              role?: "user" | "agent" | "system";
              sequence?: number;
              tenant?: string;
              text?: string;
              timeInCallSecs?: number;
              toolCalls?: Array<{
                argsJson: string;
                callId: string;
                name: string;
              }>;
              toolResults?: Array<{
                callId: string;
                isError?: boolean;
                latencyMs?: number;
                output: string;
              }>;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      conversations: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"conversations">;
            acceptedAt?: string;
            agentId: Id<"agents">;
            agentVersionId: Id<"agentVersions">;
            batchCallRecipientId?: Id<"batchCallRecipients">;
            channel:
              "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
            createdAt: string;
            direction: "inbound" | "outbound";
            durationSecs?: number;
            endedAt?: string;
            externalNumber?: string;
            hasAudio?: boolean;
            messageCount?: number;
            phoneNumberId?: Id<"phoneNumbers">;
            provider: "openai" | "xai";
            providerSessionId?: string;
            startedAt: string;
            status:
              "initiated" | "in_progress" | "processing" | "done" | "failed";
            successStatus?: "success" | "failure" | "unknown";
            summary?: string;
            tenant: string;
            terminationReason?: string;
            updatedAt?: string;
            usage?: {
              costUsd?: number;
              inputTokens: number;
              outputTokens: number;
            };
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"conversations"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"conversations"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"conversations">;
            patch: {
              _creationTime?: number;
              _id?: Id<"conversations">;
              acceptedAt?: string;
              agentId?: Id<"agents">;
              agentVersionId?: Id<"agentVersions">;
              batchCallRecipientId?: Id<"batchCallRecipients">;
              channel?:
                "voice_inbound" | "voice_outbound" | "whatsapp" | "sms" | "web";
              createdAt?: string;
              direction?: "inbound" | "outbound";
              durationSecs?: number;
              endedAt?: string;
              externalNumber?: string;
              hasAudio?: boolean;
              messageCount?: number;
              phoneNumberId?: Id<"phoneNumbers">;
              provider?: "openai" | "xai";
              providerSessionId?: string;
              startedAt?: string;
              status?:
                "initiated" | "in_progress" | "processing" | "done" | "failed";
              successStatus?: "success" | "failure" | "unknown";
              summary?: string;
              tenant?: string;
              terminationReason?: string;
              updatedAt?: string;
              usage?: {
                costUsd?: number;
                inputTokens: number;
                outputTokens: number;
              };
            };
          },
          any
        >;
      };
      email: {
        handleEmailEvent: FunctionReference<
          "mutation",
          "internal",
          {
            event:
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.sent";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.delivered";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.delivery_delayed";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.complained";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    bounce: { message: string; subType: string; type: string };
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.bounced";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    open: {
                      ipAddress: string;
                      timestamp: string;
                      userAgent: string;
                    };
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.opened";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    click: {
                      ipAddress: string;
                      link: string;
                      timestamp: string;
                      userAgent: string;
                    };
                    created_at: string;
                    email_id: string;
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.clicked";
                }
              | {
                  created_at: string;
                  data: {
                    bcc?: string | Array<string>;
                    broadcast_id?: string;
                    cc?: string | Array<string>;
                    created_at: string;
                    email_id: string;
                    failed: { reason: string };
                    from: string | Array<string>;
                    headers?: Array<{ name: string; value: string }>;
                    reply_to?: string | Array<string>;
                    subject: string;
                    tags?:
                      | Record<string, string>
                      | Array<{ name: string; value: string }>;
                    to: string | Array<string>;
                  };
                  type: "email.failed";
                };
            id: string;
          },
          any
        >;
      };
      kbChunks: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"kbChunks">;
            createdAt: string;
            documentId: Id<"kbDocuments">;
            embeddingId?: Id<"kbEmbeddings">;
            order: number;
            tenant: string;
            text: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"kbChunks"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"kbChunks"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"kbChunks">;
            patch: {
              _creationTime?: number;
              _id?: Id<"kbChunks">;
              createdAt?: string;
              documentId?: Id<"kbDocuments">;
              embeddingId?: Id<"kbEmbeddings">;
              order?: number;
              tenant?: string;
              text?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      kbDocuments: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"kbDocuments">;
            chunkCount?: number;
            content?: string;
            createdAt: string;
            failureReason?: string;
            name: string;
            sizeBytes?: number;
            sourceUrl?: string;
            status?: "processing" | "indexed" | "failed";
            storageId?: string;
            tenant: string;
            type: "text" | "url" | "file";
            updatedAt?: string;
            usageMode?: "auto" | "prompt";
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"kbDocuments"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"kbDocuments"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"kbDocuments">;
            patch: {
              _creationTime?: number;
              _id?: Id<"kbDocuments">;
              chunkCount?: number;
              content?: string;
              createdAt?: string;
              failureReason?: string;
              name?: string;
              sizeBytes?: number;
              sourceUrl?: string;
              status?: "processing" | "indexed" | "failed";
              storageId?: string;
              tenant?: string;
              type?: "text" | "url" | "file";
              updatedAt?: string;
              usageMode?: "auto" | "prompt";
            };
          },
          any
        >;
      };
      kbEmbeddings: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"kbEmbeddings">;
            createdAt: string;
            documentId: Id<"kbDocuments">;
            embedding: Array<number>;
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"kbEmbeddings"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"kbEmbeddings"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"kbEmbeddings">;
            patch: {
              _creationTime?: number;
              _id?: Id<"kbEmbeddings">;
              createdAt?: string;
              documentId?: Id<"kbDocuments">;
              embedding?: Array<number>;
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      mcpConnections: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"mcpConnections">;
            allowedTools?: Array<string>;
            approvalPolicy?:
              | "auto_approve_all"
              | "require_approval_all"
              | "require_approval_per_tool";
            composioAccountId?: string;
            createdAt: string;
            description?: string;
            kind: "composio" | "byo";
            name: string;
            requestHeaders?: Record<string, string | { secretRef: string }>;
            responseTimeoutSecs?: number;
            secretRef?: string;
            status?: "active" | "disabled" | "error";
            tenant: string;
            toolApprovals?: Array<{
              policy: "auto_approved" | "requires_approval";
              toolHash: string;
              toolName: string;
            }>;
            toolConfigOverrides?: Array<{
              inputOverrides?: Record<
                string,
                | { source: "constant"; value: string }
                | { name: string; source: "dynamic_variable" }
                | { prompt?: string; source: "llm" }
                | { source: "omit" }
              >;
              toolName: string;
            }>;
            toolkitSlugs?: Array<string>;
            transport?: "sse" | "streamable_http";
            updatedAt?: string;
            url?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"mcpConnections"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"mcpConnections"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"mcpConnections">;
            patch: {
              _creationTime?: number;
              _id?: Id<"mcpConnections">;
              allowedTools?: Array<string>;
              approvalPolicy?:
                | "auto_approve_all"
                | "require_approval_all"
                | "require_approval_per_tool";
              composioAccountId?: string;
              createdAt?: string;
              description?: string;
              kind?: "composio" | "byo";
              name?: string;
              requestHeaders?: Record<string, string | { secretRef: string }>;
              responseTimeoutSecs?: number;
              secretRef?: string;
              status?: "active" | "disabled" | "error";
              tenant?: string;
              toolApprovals?: Array<{
                policy: "auto_approved" | "requires_approval";
                toolHash: string;
                toolName: string;
              }>;
              toolConfigOverrides?: Array<{
                inputOverrides?: Record<
                  string,
                  | { source: "constant"; value: string }
                  | { name: string; source: "dynamic_variable" }
                  | { prompt?: string; source: "llm" }
                  | { source: "omit" }
                >;
                toolName: string;
              }>;
              toolkitSlugs?: Array<string>;
              transport?: "sse" | "streamable_http";
              updatedAt?: string;
              url?: string;
            };
          },
          any
        >;
      };
      phoneNumbers: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"phoneNumbers">;
            assignedAgentId?: Id<"agents">;
            createdAt: string;
            label?: string;
            number: string;
            provider: "twilio" | "sip_trunk";
            status?: "active" | "disabled";
            tenant: string;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"phoneNumbers"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"phoneNumbers"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"phoneNumbers">;
            patch: {
              _creationTime?: number;
              _id?: Id<"phoneNumbers">;
              assignedAgentId?: Id<"agents">;
              createdAt?: string;
              label?: string;
              number?: string;
              provider?: "twilio" | "sip_trunk";
              status?: "active" | "disabled";
              tenant?: string;
              updatedAt?: string;
            };
          },
          any
        >;
      };
      procedures: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"procedures">;
            agentId: Id<"agents">;
            content?: string;
            createdAt: string;
            name: string;
            references?: Array<{
              health?: "valid" | "invalid" | "unavailable";
              location: "trigger" | "content";
              targetId: string;
              targetType:
                "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
            }>;
            source?: "manual" | "sop_import" | "generated";
            status?: "draft" | "active" | "archived";
            steps?: Array<
              | { instruction: string; type: "ask" }
              | { instruction: string; type: "tell" }
              | { text: string; type: "say" }
              | { instruction?: string; toolRef: string; type: "tool" }
              | {
                  condition:
                    | { description: string; kind: "natural_language" }
                    | { expression: string; kind: "expression" };
                  steps: Array<
                    | { instruction: string; type: "ask" }
                    | { instruction: string; type: "tell" }
                    | { text: string; type: "say" }
                    | { instruction?: string; toolRef: string; type: "tool" }
                  >;
                  type: "if";
                }
            >;
            tenant: string;
            trigger: string;
            type: "free_form" | "structured";
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"procedures"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"procedures"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"procedures">;
            patch: {
              _creationTime?: number;
              _id?: Id<"procedures">;
              agentId?: Id<"agents">;
              content?: string;
              createdAt?: string;
              name?: string;
              references?: Array<{
                health?: "valid" | "invalid" | "unavailable";
                location: "trigger" | "content";
                targetId: string;
                targetType:
                  "system_tool" | "mcp_tool" | "knowledge_base" | "procedure";
              }>;
              source?: "manual" | "sop_import" | "generated";
              status?: "draft" | "active" | "archived";
              steps?: Array<
                | { instruction: string; type: "ask" }
                | { instruction: string; type: "tell" }
                | { text: string; type: "say" }
                | { instruction?: string; toolRef: string; type: "tool" }
                | {
                    condition:
                      | { description: string; kind: "natural_language" }
                      | { expression: string; kind: "expression" };
                    steps: Array<
                      | { instruction: string; type: "ask" }
                      | { instruction: string; type: "tell" }
                      | { text: string; type: "say" }
                      | { instruction?: string; toolRef: string; type: "tool" }
                    >;
                    type: "if";
                  }
              >;
              tenant?: string;
              trigger?: string;
              type?: "free_form" | "structured";
              updatedAt?: string;
            };
          },
          any
        >;
      };
      tenantSettings: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            _creationTime?: number;
            _id?: Id<"tenantSettings">;
            concurrencyLimit?: number;
            createdAt: string;
            dailyCallLimit?: number;
            recordingEnabled?: boolean;
            tenant: string;
            transcriptRetentionDays?: number;
            updatedAt?: string;
          },
          any
        >;
        destroy: FunctionReference<
          "mutation",
          "internal",
          { id: Id<"tenantSettings"> },
          any
        >;
        paginate: FunctionReference<
          "query",
          "internal",
          {
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        read: FunctionReference<
          "query",
          "internal",
          { id: Id<"tenantSettings"> },
          any
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            id: Id<"tenantSettings">;
            patch: {
              _creationTime?: number;
              _id?: Id<"tenantSettings">;
              concurrencyLimit?: number;
              createdAt?: string;
              dailyCallLimit?: number;
              recordingEnabled?: boolean;
              tenant?: string;
              transcriptRetentionDays?: number;
              updatedAt?: string;
            };
          },
          any
        >;
      };
    };
    kbSearch: {
      loadChunksByEmbeddingIds: FunctionReference<
        "query",
        "internal",
        { embeddingIds: Array<Id<"kbEmbeddings">>; tenant: string },
        any
      >;
      scopeForConversation: FunctionReference<
        "query",
        "internal",
        { conversationId: Id<"conversations"> },
        any
      >;
      search: FunctionReference<
        "action",
        "internal",
        { conversationId: Id<"conversations">; limit?: number; query: string },
        any
      >;
      searchWithVector: FunctionReference<
        "action",
        "internal",
        {
          conversationId: Id<"conversations">;
          limit?: number;
          query: string;
          vector: Array<number>;
        },
        any
      >;
      textSearch: FunctionReference<
        "query",
        "internal",
        { documentIds: Array<string>; query: string; tenant: string },
        any
      >;
    };
    knowledgeBase: {
      ingest: FunctionReference<
        "action",
        "internal",
        { documentId: Id<"kbDocuments"> },
        any
      >;
      writeChunks: FunctionReference<
        "mutation",
        "internal",
        {
          chunks: Array<{
            embedding: Array<number>;
            order: number;
            text: string;
          }>;
          documentId: Id<"kbDocuments">;
        },
        any
      >;
    };
  };
  auth: {
    authKitEvent: FunctionReference<
      "mutation",
      "internal",
      { data: Record<string, any>; event: string },
      null
    >;
    backfillUsers: FunctionReference<"mutation", "internal", {}, null>;
  };
  workos: {
    ensureCustomerRoleOnOrg: FunctionReference<
      "action",
      "internal",
      { organizationId: string },
      any
    >;
  };
};

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
