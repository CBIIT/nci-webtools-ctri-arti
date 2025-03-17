/**
 * Module Renderer System Integration for FedPulse
 * 
 * This file provides the integration code for the module renderer system,
 * allowing dynamic JavaScript module execution from localStorage within
 * the FedPulse application.
 */

// Module Renderer Core Functions

/**
 * Renders an application in an iframe with inlined modules from localStorage
 * @param {string} htmlTemplateFileName - Filename of the HTML template in localStorage
 * @param {Array<string>} moduleFileNames - Array of module filenames in localStorage
 * @param {Object} options - Additional options
 * @param {Object} options.storage - Storage provider (defaults to localStorage)
 * @param {boolean} options.captureConsole - Whether to capture console output (default: true)
 * @param {boolean|string} options.visible - Whether the iframe should be visible or height string (default: true)
 * @param {function} options.onConsole - Callback for console messages
 * @param {function} options.onLoad - Callback when iframe is loaded
 * @param {function} options.onError - Callback for errors
 * @returns {HTMLIFrameElement} - The created iframe element
 */
export function renderApp(htmlTemplateFileName, moduleFileNames = [], options = {}) {
  const {
    storage = localStorage,
    captureConsole = true,
    visible = true,
    onConsole = null,
    onLoad = null,
    onError = null
  } = options;
  
  // Load HTML template from storage
  const html = storage.getItem(htmlTemplateFileName);
  if (!html) {
    throw new Error(`HTML template not found: ${htmlTemplateFileName}`);
  }
  
  // Load all modules from storage
  const modules = {};
  for (const fileName of moduleFileNames) {
    const moduleCode = storage.getItem(fileName);
    if (!moduleCode) {
      console.warn(`Module not found in storage: ${fileName}`);
      continue;
    }
    modules[fileName] = moduleCode;
  }
  
  // Generate a unique ID for this instance
  const instanceId = `app_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  // Process modules to create inlined module scripts
  const inlinedModules = Object.entries(modules).map(([name, code]) => {
    // Comment out relative imports since they're all inlined
    const processedCode = code.replace(
      /^(import\s+.+?\s+from\s+['"])\.\/(.+?)(['"])/gm,
      '// $1./$2$3 - Using inlined version instead'
    );
    
    return `
      <!-- Module: ${name} -->
      <script type="module" data-module-name="${name}">
        ${processedCode}
      </script>
    `;
  }).join('\n');
  
  // Create console capture script if needed
  let consoleScript = '';
  if (captureConsole) {
    consoleScript = `
      <script>
        // Set up communication with parent window
        window.appInstanceId = "${instanceId}";
        
        // Capture console output
        const originalConsole = {
          log: console.log,
          warn: console.warn,
          error: console.error,
          info: console.info,
          debug: console.debug
        };
        
        function captureConsole(method) {
          return function(...args) {
            // Still call original
            originalConsole[method](...args);
            
            // Convert args to serializable format and send to parent
            const serialized = args.map(arg => {
              try {
                return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
              } catch (e) {
                return '[Unserializable value]';
              }
            });
            
            window.parent.postMessage({
              type: 'console',
              instanceId: "${instanceId}",
              method,
              content: serialized.join(' ')
            }, '*');
          };
        }
        
        console.log = captureConsole('log');
        console.warn = captureConsole('warn');
        console.error = captureConsole('error');
        console.info = captureConsole('info');
        console.debug = captureConsole('debug');
        
        // Report errors to parent
        window.addEventListener('error', (event) => {
          window.parent.postMessage({
            type: 'error',
            instanceId: "${instanceId}",
            message: event.message,
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error?.toString()
          }, '*');
          
          return false; // Don't prevent default error handling
        });
        
        // Report when fully loaded
        window.addEventListener('load', () => {
          window.parent.postMessage({
            type: 'load',
            instanceId: "${instanceId}"
          }, '*');
        });

        // Override fetch
        const originalFetch = window.fetch;
        window.fetch = async function fetchProxy(url, requestInit = {}) {
          try {
            const proxyEndpoint = "/api/proxy";
            while (new URL(url).pathname.startsWith(proxyEndpoint)) {
              url = decodeURIComponent(new URL(url).pathname.slice(proxyEndpoint.length).replace(/^\/+/, ""));
            }
            return await fetch(proxyEndpoint + "/" + encodeURIComponent(url), requestInit);
          } catch (error) {
            throw new Error("Invalid proxy URL:" + url);
          }
        }
      </script>
    `;
  }
  
  // Replace the modules placeholder in the HTML template
  let appHtml = html.replace('<!--MODULES-->', inlinedModules);
  
  // Add console capturing if needed - insert after <head> tag
  if (captureConsole) {
    appHtml = appHtml.replace(/<head>/, `<head>${consoleScript}`);
  }
  
  // Create an iframe to render the app
  const iframe = document.createElement('iframe');
  
  // Style the iframe based on visibility setting
  if (visible) {
    iframe.style.width = '100%';
    iframe.style.height = typeof visible === 'string' ? visible : '500px';
    iframe.style.border = '1px solid #ccc';
    iframe.style.borderRadius = '4px';
  } else {
    iframe.style.display = 'none';
  }
  
  // Set sandbox attributes - allow scripts but restrict other permissions as needed
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  
  // Set a data attribute to identify this instance
  iframe.dataset.instanceId = instanceId;
  
  // Set up message listener for communication from the iframe
  const messageHandler = (event) => {
    if (event.data && event.data.instanceId === instanceId) {
      switch (event.data.type) {
        case 'console':
          if (onConsole) {
            onConsole(event.data.method, event.data.content);
          }
          break;
        
        case 'error':
          if (onError) {
            onError(event.data);
          }
          break;
        
        case 'load':
          if (onLoad) {
            onLoad(iframe);
          }
          break;
      }
    }
  };
  
  window.addEventListener('message', messageHandler);
  
  // Store the message handler for potential cleanup
  iframe._messageHandler = messageHandler;
  
  // Create a method to cleanly remove the iframe
  iframe.remove = function() {
    window.removeEventListener('message', this._messageHandler);
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  };
  
  // Load the HTML into the iframe
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(appHtml)}`;
  iframe.src = dataUrl;
  
  return iframe;
}

/**
 * Lists all files in storage with optional filtering
 * @param {Object} options - Options for listing
 * @param {string} options.extension - Filter by file extension
 * @param {string} options.prefix - Filter by filename prefix
 * @param {Object} options.storage - Storage provider (defaults to localStorage)
 * @returns {Array<string>} - Array of matching filenames
 */
export function listFiles(options = {}) {
  const { extension = '', prefix = '', storage = localStorage } = options;
  
  const files = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    
    if (extension && !key.endsWith(extension)) continue;
    if (prefix && !key.startsWith(prefix)) continue;
    
    files.push(key);
  }
  
  return files;
}

/**
 * Creates a new HTML template in storage
 * @param {string} fileName - Name to save the template as
 * @param {string} title - The application title
 * @param {Object} options - Additional options
 * @param {string} options.styles - Additional CSS styles
 * @param {string} options.initScript - Custom initialization JavaScript
 * @param {Object} options.storage - Storage provider (defaults to localStorage)
 * @returns {string} - The created template content
 */
export function createAppTemplate(fileName, title, options = {}) {
  const { 
    styles = '', 
    initScript = '',
    storage = localStorage
  } = options;
  
  const template = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    .result {
      background-color: #f9f9f9;
      border-left: 4px solid #2196F3;
      padding: 10px;
      margin-top: 20px;
    }
    button {
      background-color: #4CAF50;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 8px;
    }
    ${styles}
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div id="app">
      <div class="controls">
        <button id="run-button">Run</button>
        <button id="clear-button">Clear</button>
      </div>
      <div id="output" class="result"></div>
    </div>
  </div>
  
  <!--MODULES-->
  
  <script>
    // Initialize the application after all modules are loaded
    document.addEventListener('DOMContentLoaded', function() {
      // Get references to UI elements
      const runButton = document.getElementById('run-button');
      const clearButton = document.getElementById('clear-button');
      const output = document.getElementById('output');
      
      // Set up event handlers
      runButton.addEventListener('click', async function() {
        output.innerHTML = '<p>Running...</p>';
        
        try {
          ${initScript || `
          // Default initialization code
          import('./main.js').then(module => {
            const result = module.run();
            output.innerHTML = '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
          }).catch(err => {
            output.innerHTML = '<p>Error: ' + err.message + '</p>';
          });
          `}
        } catch (err) {
          output.innerHTML = '<p>Error: ' + err.message + '</p>';
        }
      });
      
      clearButton.addEventListener('click', function() {
        output.innerHTML = '';
      });
    });
  </script>
</body>
</html>
  `;
  
  storage.setItem(fileName, template);
  return template;
}

/**
 * Creates a new module in storage
 * @param {string} fileName - Name to save the module as
 * @param {string} content - Module content
 * @param {Object} options - Additional options
 * @param {Object} options.storage - Storage provider (defaults to localStorage)
 * @returns {string} - The module content
 */
export function createModule(fileName, content, options = {}) {
  const { storage = localStorage } = options;
  storage.setItem(fileName, content);
  return content;
}

/**
 * Analyzes the dependency graph of modules in storage
 * @param {Object} options - Options for analysis
 * @param {Object} options.storage - Storage provider (defaults to localStorage)
 * @param {string} options.extension - Filter by file extension (default: '.js')
 * @returns {Object} - Dependency graph information
 */
export function analyzeModuleDependencies(options = {}) {
  const { storage = localStorage, extension = '.js' } = options;
  
  const modules = {};
  const dependencies = {};
  
  // Get all modules from storage
  listFiles({ extension, storage }).forEach(key => {
    modules[key] = storage.getItem(key);
  });
  
  // Extract dependencies
  Object.entries(modules).forEach(([fileName, code]) => {
    dependencies[fileName] = [];
    const importRegex = /^import\s+.+?\s+from\s+['"](\.?\.\/[^'"]+)['"]/gm;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Normalize paths - handle ../
        let normalizedPath = importPath;
        if (importPath.startsWith('./')) {
          normalizedPath = importPath.slice(2);
        }
        // Add .js extension if missing
        if (!normalizedPath.endsWith('.js')) {
          normalizedPath = normalizedPath + '.js';
        }
        dependencies[fileName].push(normalizedPath);
      } else {
        dependencies[fileName].push(importPath);
      }
    }
  });
  
  // Calculate module loading order (topological sort)
  const visited = new Set();
  const temp = new Set();
  const order = [];
  
  function visit(node) {
    if (temp.has(node)) {
      throw new Error(`Circular dependency detected involving ${node}`);
    }
    if (visited.has(node)) {
      return;
    }
    temp.add(node);
    
    const deps = dependencies[node] || [];
    deps.forEach(dep => {
      if (modules[dep]) {
        visit(dep);
      }
    });
    
    temp.delete(node);
    visited.add(node);
    order.push(node);
  }
  
  // Visit all modules
  Object.keys(modules).forEach(module => {
    if (!visited.has(module)) {
      try {
        visit(module);
      } catch (error) {
        console.warn(`Dependency error for ${module}: ${error.message}`);
      }
    }
  });
  
  return {
    modules: Object.keys(modules),
    dependencies,
    dependencyCount: Object.values(dependencies).reduce((sum, deps) => sum + deps.length, 0),
    loadingOrder: order
  };
}

// Module Renderer Facade for Tool Integration

/**
 * Module renderer tool for the FedPulse application
 * Allows executing JavaScript modules stored in localStorage
 * @param {Object} params - Tool parameters
 * @param {string} params.command - The operation to perform (create_template, create_module, render, analyze)
 * @param {string} params.template_name - Template filename (for create_template and render commands)
 * @param {string} params.template_title - Title for the template (for create_template command)
 * @param {string} params.template_styles - Additional CSS styles (for create_template command)
 * @param {string} params.template_init - Initialization script (for create_template command)
 * @param {string} params.module_name - Module filename (for create_module command)
 * @param {string} params.module_content - Module content (for create_module command)
 * @param {Array<string>} params.modules - Array of module filenames to render (for render command)
 * @param {string} params.container_id - ID of container element to append the iframe to (for render command)
 * @param {boolean} params.capture_console - Whether to capture console output (for render command)
 * @param {string|boolean} params.visible - Visibility setting for the iframe (for render command)
 * @returns {Object} - Result of the operation
 */
export function moduleRenderer(params = {}) {
  const { command } = params;
  
  try {
    switch (command) {
      case 'create_template': {
        const { template_name, template_title, template_styles, template_init } = params;
        
        if (!template_name) {
          return { success: false, error: 'Missing required parameter: template_name' };
        }
        
        if (!template_title) {
          return { success: false, error: 'Missing required parameter: template_title' };
        }
        
        const template = createAppTemplate(template_name, template_title, {
          styles: template_styles || '',
          initScript: template_init || ''
        });
        
        return {
          success: true,
          message: `Template created: ${template_name}`,
          template_size: template.length
        };
      }
      
      case 'create_module': {
        const { module_name, module_content } = params;
        
        if (!module_name) {
          return { success: false, error: 'Missing required parameter: module_name' };
        }
        
        if (!module_content) {
          return { success: false, error: 'Missing required parameter: module_content' };
        }
        
        createModule(module_name, module_content);
        
        return {
          success: true,
          message: `Module created: ${module_name}`,
          module_size: module_content.length
        };
      }
      
      case 'render': {
        const { template_name, modules = [], container_id, capture_console = true, visible = true } = params;
        
        if (!template_name) {
          return { success: false, error: 'Missing required parameter: template_name' };
        }
        
        // Create an iframe but don't append it to the DOM yet
        const iframe = renderApp(template_name, modules, {
          captureConsole: capture_console,
          visible,
          onConsole: (method, content) => {
            console.log(`[Module ${method}]`, content);
          },
          onError: (error) => {
            console.error('[Module Error]', error);
          },
          onLoad: () => {
            console.log('[Module] Application loaded');
          }
        });
        
        // If container_id is provided, try to append the iframe
        if (container_id) {
          const container = document.getElementById(container_id);
          if (container) {
            container.appendChild(iframe);
          } else {
            return { 
              success: false, 
              error: `Container element not found: ${container_id}`,
              iframe_id: iframe.dataset.instanceId
            };
          }
        }
        
        return {
          success: true,
          message: `Application rendered from template: ${template_name}`,
          iframe_id: iframe.dataset.instanceId,
          modules_count: modules.length
        };
      }
      
      case 'analyze': {
        const result = analyzeModuleDependencies();
        
        return {
          success: true,
          modules_count: result.modules.length,
          dependencies_count: result.dependencyCount,
          loading_order: result.loadingOrder,
          dependencies: result.dependencies
        };
      }
      
      case 'list': {
        const { extension, prefix } = params;
        const files = listFiles({ extension, prefix });
        
        return {
          success: true,
          files_count: files.length,
          files
        };
      }
      
      default:
        return { 
          success: false, 
          error: `Unknown command: ${command}`,
          available_commands: ['create_template', 'create_module', 'render', 'analyze', 'list']
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}