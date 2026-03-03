#!/usr/bin/env node

/**
 * Unit Test Runner
 * Tests individual components without Chrome APIs
 */

import { TestRunner, log } from './shared/runner.js';
import { runAiProviderConfigSuite } from './suites/ai-provider-config.test.js';
import { runApiErrorClassificationSuite } from './suites/api-error-classification.test.js';
import { runCodexOauthConfigSuite } from './suites/codex-oauth-config.test.js';
import { runConversationCompactionSuite } from './suites/conversation-compaction.test.js';
import { runErrorHandlingSuite } from './suites/error-handling.test.js';
import { runInputValidationSuite } from './suites/input-validation.test.js';
import { runMessageSchemaSuite } from './suites/message-schema.test.js';
import { runOauthCandidatesSuite } from './suites/oauth-candidates.test.js';
import { runOauthModelNormalizationSuite } from './suites/oauth-model-normalization.test.js';
import { runPlanNormalizationSuite } from './suites/plan-normalization.test.js';
import { runRetryHelpersSuite } from './suites/retry-helpers.test.js';
import { runRuntimeMessagesSuite } from './suites/runtime-messages.test.js';
import { runRuntimeProfileRoutingSuite } from './suites/runtime-profile-routing.test.js';
import { runThinkingExtractionSuite } from './suites/thinking-extraction.test.js';
import { runToolDefinitionsSuite } from './suites/tool-definitions.test.js';
import { runToolSchemaConversionSuite } from './suites/tool-schema-conversion.test.js';

function main() {
  log('╔════════════════════════════════════════╗', 'info');
  log('║       Unit Tests - Browser Tools       ║', 'info');
  log('╚════════════════════════════════════════╝', 'info');

  const runner = new TestRunner();

  runToolDefinitionsSuite(runner);
  runAiProviderConfigSuite(runner);
  runToolSchemaConversionSuite(runner);
  runInputValidationSuite(runner);
  runErrorHandlingSuite(runner);
  runApiErrorClassificationSuite(runner);
  runOauthModelNormalizationSuite(runner);
  runOauthCandidatesSuite(runner);
  runRuntimeProfileRoutingSuite(runner);
  runCodexOauthConfigSuite(runner);
  runMessageSchemaSuite(runner);
  runConversationCompactionSuite(runner);
  runThinkingExtractionSuite(runner);
  runPlanNormalizationSuite(runner);
  runRetryHelpersSuite(runner);
  runRuntimeMessagesSuite(runner);

  const success = runner.printSummary();
  process.exit(success ? 0 : 1);
}

main();
