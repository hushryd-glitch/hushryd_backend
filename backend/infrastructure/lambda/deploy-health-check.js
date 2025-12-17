/**
 * CodeDeploy Lifecycle Hook - Health Check Lambda
 * 
 * This Lambda function is invoked during the AfterAllowTestTraffic lifecycle hook
 * to validate the deployment before production traffic is shifted.
 * 
 * Requirements: 2.4, 12.1 - Auto-rollback on failure within 60 seconds
 */

const https = require('https');
const AWS = require('aws-sdk');

const codedeploy = new AWS.CodeDeploy();

// Configuration
const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'https://api.hushryd.com';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5', 10);
const RETRY_INTERVAL_MS = parseInt(process.env.RETRY_INTERVAL_MS || '5000', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '10000', 10);

/**
 * Perform HTTP health check
 */
async function performHealthCheck(url) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = https.get(url, { timeout: TIMEOUT_MS }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const latency = Date.now() - startTime;
        
        try {
          const body = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            body,
            latency
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data,
            latency
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Run comprehensive health checks
 */
async function runHealthChecks() {
  const results = {
    basic: { status: 'pending' },
    deep: { status: 'pending' },
    ready: { status: 'pending' }
  };
  
  // Basic health check
  try {
    const basicResult = await performHealthCheck(`${HEALTH_CHECK_URL}/health`);
    results.basic = {
      status: basicResult.statusCode === 200 ? 'ok' : 'failed',
      statusCode: basicResult.statusCode,
      latency: basicResult.latency
    };
  } catch (error) {
    results.basic = { status: 'error', error: error.message };
  }
  
  // Deep health check
  try {
    const deepResult = await performHealthCheck(`${HEALTH_CHECK_URL}/health/deep`);
    const dbStatus = deepResult.body?.checks?.database?.status || 'unknown';
    results.deep = {
      status: deepResult.statusCode === 200 && dbStatus === 'ok' ? 'ok' : 'failed',
      statusCode: deepResult.statusCode,
      database: dbStatus,
      latency: deepResult.latency
    };
  } catch (error) {
    results.deep = { status: 'error', error: error.message };
  }
  
  // Readiness check
  try {
    const readyResult = await performHealthCheck(`${HEALTH_CHECK_URL}/ready`);
    results.ready = {
      status: readyResult.statusCode === 200 ? 'ok' : 'failed',
      statusCode: readyResult.statusCode,
      latency: readyResult.latency
    };
  } catch (error) {
    results.ready = { status: 'error', error: error.message };
  }
  
  return results;
}

/**
 * Wait and retry health checks
 */
async function waitForHealthy() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`Health check attempt ${attempt}/${MAX_RETRIES}`);
    
    const results = await runHealthChecks();
    console.log('Health check results:', JSON.stringify(results, null, 2));
    
    const allPassed = 
      results.basic.status === 'ok' &&
      results.deep.status === 'ok' &&
      results.ready.status === 'ok';
    
    if (allPassed) {
      console.log('All health checks passed!');
      return { success: true, results };
    }
    
    if (attempt < MAX_RETRIES) {
      console.log(`Waiting ${RETRY_INTERVAL_MS}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
  
  const finalResults = await runHealthChecks();
  return { success: false, results: finalResults };
}

/**
 * Report lifecycle hook status to CodeDeploy
 */
async function reportLifecycleStatus(deploymentId, lifecycleEventHookExecutionId, status) {
  const params = {
    deploymentId,
    lifecycleEventHookExecutionId,
    status // 'Succeeded' or 'Failed'
  };
  
  console.log('Reporting lifecycle status:', params);
  
  return codedeploy.putLifecycleEventHookExecutionStatus(params).promise();
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  const deploymentId = event.DeploymentId;
  const lifecycleEventHookExecutionId = event.LifecycleEventHookExecutionId;
  
  if (!deploymentId || !lifecycleEventHookExecutionId) {
    console.error('Missing required event parameters');
    return { statusCode: 400, body: 'Missing required parameters' };
  }
  
  try {
    console.log(`Starting health check for deployment: ${deploymentId}`);
    
    const { success, results } = await waitForHealthy();
    
    if (success) {
      console.log('Health check succeeded - allowing traffic shift');
      await reportLifecycleStatus(deploymentId, lifecycleEventHookExecutionId, 'Succeeded');
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Health check passed',
          results
        })
      };
    } else {
      console.error('Health check failed - triggering rollback');
      await reportLifecycleStatus(deploymentId, lifecycleEventHookExecutionId, 'Failed');
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Health check failed',
          results
        })
      };
    }
  } catch (error) {
    console.error('Error during health check:', error);
    
    try {
      await reportLifecycleStatus(deploymentId, lifecycleEventHookExecutionId, 'Failed');
    } catch (reportError) {
      console.error('Failed to report lifecycle status:', reportError);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Health check error',
        error: error.message
      })
    };
  }
};
