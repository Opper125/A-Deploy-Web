// Supabase Configuration
const SUPABASE_URL = "https://zrjfyaloaicrvkcfkpxf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyamZ5YWxvYWljcnZrY2ZrcHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MDAyOTAsImV4cCI6MjA3NTk3NjI5MH0.JszbKpjiP-jYgAthvdHBIn1atsFC5fs6SYIqssoN7cc";

let currentEditUserId = null;

// Supabase API Helper
async function supabaseRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const response = await fetch(url, options);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Database error occurred');
    }

    return method === 'DELETE' ? null : await response.json();
}

// Hash Password
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Show Section
function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.getElementById(`${sectionName}Section`).classList.add('active');
    event.target.classList.add('active');
    
    // Load data for section
    if (sectionName === 'users') loadUsers();
    if (sectionName === 'projects') loadProjects();
    if (sectionName === 'sessions') loadSessions();
    if (sectionName === 'logs') loadLogs();
}

// Load Users
async function loadUsers() {
    try {
        const users = await supabaseRequest('users?order=created_at.desc');
        const sessions = await supabaseRequest('active_sessions');
        
        // Update stats
        document.getElementById('totalUsers').textContent = users.length;
        document.getElementById('bannedUsers').textContent = users.filter(u => u.is_banned).length;
        document.getElementById('activeSessions').textContent = sessions.length;
        
        // Render table
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td><strong>${escapeHtml(user.username)}</strong></td>
                <td><code>${user.ip_address || 'N/A'}</code></td>
                <td><code class="code-display">${user.password_hash?.substring(0, 20)}...</code></td>
                <td>${user.device_limit === 999 ? 'Unlimited' : user.device_limit}</td>
                <td>${user.allowed_ips && user.allowed_ips.length > 0 ? user.allowed_ips.join(', ') : 'None'}</td>
                <td>
                    <span class="badge ${user.is_banned ? 'danger' : 'success'}">
                        ${user.is_banned ? 'Banned' : 'Active'}
                    </span>
                </td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                <td>
                    <button onclick="editUser('${user.id}')" class="btn btn-secondary btn-sm">Edit</button>
                    <button onclick="toggleBan('${user.id}', ${user.is_banned})" class="btn ${user.is_banned ? 'btn-success' : 'btn-danger'} btn-sm">
                        ${user.is_banned ? 'Unban' : 'Ban'}
                    </button>
                    <button onclick="deleteUser('${user.id}', '${escapeHtml(user.username)}')" class="btn btn-danger btn-sm">Delete</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Load users error:', error);
    }
}

// Load Projects
async function loadProjects() {
    try {
        const projects = await supabaseRequest('projects?order=created_at.desc');
        
        // Update stats
        document.getElementById('totalProjects').textContent = projects.length;
        document.getElementById('activeProjects').textContent = projects.filter(p => p.status === 'active').length;
        document.getElementById('totalDeployments').textContent = projects.reduce((sum, p) => sum + p.deploy_count, 0);
        
        // Get file counts for each project
        const projectsWithFiles = await Promise.all(projects.map(async (project) => {
            const files = await supabaseRequest(`project_files?project_id=eq.${project.id}&select=id`);
            return { ...project, filesCount: files.length };
        }));
        
        // Render table
        const tbody = document.getElementById('projectsTableBody');
        tbody.innerHTML = projectsWithFiles.map(project => `
            <tr>
                <td><strong>${escapeHtml(project.project_name)}</strong></td>
                <td>${escapeHtml(project.username)}</td>
                <td><code>${escapeHtml(project.domain_name)}</code></td>
                <td><span class="badge ${project.status === 'active' ? 'success' : 'warning'}">${project.status}</span></td>
                <td>${project.filesCount}</td>
                <td>${project.deploy_count}</td>
                <td>${new Date(project.created_at).toLocaleDateString()}</td>
                <td>
                    <button onclick="viewProjectFiles('${project.id}')" class="btn btn-secondary btn-sm">View Files</button>
                    <button onclick="deleteProject('${project.id}', '${escapeHtml(project.project_name)}')" class="btn btn-danger btn-sm">Delete</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Load projects error:', error);
    }
}

// Load Sessions
async function loadSessions() {
    try {
        const sessions = await supabaseRequest('active_sessions?order=login_time.desc');
        
        const tbody = document.getElementById('sessionsTableBody');
        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td><strong>${escapeHtml(session.username)}</strong></td>
                <td><code>${session.ip_address}</code></td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(session.user_agent)}</td>
                <td>${new Date(session.login_time).toLocaleString()}</td>
                <td>
                    <button onclick="deleteSession('${session.id}')" class="btn btn-danger btn-sm">Terminate</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Load sessions error:', error);
    }
}

// Load Logs
async function loadLogs() {
    try {
        const logs = await supabaseRequest('deployment_logs?order=created_at.desc&limit=100');
        const projects = await supabaseRequest('projects?select=id,project_name');
        
        const projectMap = {};
        projects.forEach(p => projectMap[p.id] = p.project_name);
        
        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${escapeHtml(projectMap[log.project_id] || 'Unknown')}</td>
                <td><code>${log.action}</code></td>
                <td><span class="badge ${log.status === 'success' ? 'success' : 'danger'}">${log.status}</span></td>
                <td>${escapeHtml(log.message)}</td>
                <td>${new Date(log.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Load logs error:', error);
    }
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create User Modal
function showCreateUserModal() {
    document.getElementById('createUserModal').classList.add('show');
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('show');
    document.getElementById('createUserForm').reset();
}

// Create User
document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    
    try {
        const hashedPassword = await hashPassword(password);
        
        await supabaseRequest('users', 'POST', {
            username,
            password_hash: hashedPassword,
            device_limit: 999,
            allowed_ips: []
        });
        
        alert('✅ User created successfully!');
        closeCreateUserModal();
        loadUsers();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
});

// Edit User
async function editUser(userId) {
    currentEditUserId = userId;
    
    try {
        const user = await supabaseRequest(`users?id=eq.${userId}`);
        
        document.getElementById('editUserId').value = userId;
        document.getElementById('editUsername').value = user[0].username;
        document.getElementById('editDeviceLimit').value = user[0].device_limit;
        document.getElementById('editAllowedIPs').value = user[0].allowed_ips ? user[0].allowed_ips.join(', ') : '';
        
        document.getElementById('editUserModal').classList.add('show');
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('show');
}

// Save User Changes
document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const deviceLimit = parseInt(document.getElementById('editDeviceLimit').value);
    const allowedIPsText = document.getElementById('editAllowedIPs').value.trim();
    const allowedIPs = allowedIPsText ? allowedIPsText.split(',').map(ip => ip.trim()) : [];
    
    try {
        await supabaseRequest(`users?id=eq.${currentEditUserId}`, 'PATCH', {
            device_limit: deviceLimit,
            allowed_ips: allowedIPs
        });
        
        alert('✅ User updated successfully!');
        closeEditUserModal();
        loadUsers();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
});

// Toggle Ban
async function toggleBan(userId, currentBanStatus) {
    try {
        await supabaseRequest(`users?id=eq.${userId}`, 'PATCH', {
            is_banned: !currentBanStatus
        });
        
        loadUsers();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// Delete User
async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }
    
    try {
        await supabaseRequest(`users?id=eq.${userId}`, 'DELETE');
        alert('✅ User deleted successfully!');
        loadUsers();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// Delete Project
async function deleteProject(projectId, projectName) {
    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) {
        return;
    }
    
    try {
        await supabaseRequest(`projects?id=eq.${projectId}`, 'DELETE');
        alert('✅ Project deleted successfully!');
        loadProjects();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// View Project Files
async function viewProjectFiles(projectId) {
    try {
        const files = await supabaseRequest(`project_files?project_id=eq.${projectId}&order=file_name.asc`);
        const envVars = await supabaseRequest(`env_variables?project_id=eq.${projectId}`);
        
        const content = document.getElementById('projectFilesContent');
        
        let html = '<h3>Files</h3>';
        html += '<div style="margin-bottom: 24px;">';
        
        if (files.length === 0) {
            html += '<p>No files found</p>';
        } else {
            files.forEach(file => {
                html += `
                    <div style="background: var(--bg-color); padding: 16px; margin: 8px 0; border-radius: 8px;">
                        <strong>📄 ${escapeHtml(file.file_name)}</strong> (${(file.file_size / 1024).toFixed(2)} KB)
                        <pre style="margin-top: 8px; padding: 12px; background: var(--surface-color); border-radius: 6px; overflow-x: auto; max-height: 200px;">${escapeHtml(file.file_content?.substring(0, 500))}${file.file_content?.length > 500 ? '...' : ''}</pre>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        
        if (envVars.length > 0) {
            html += '<h3>Environment Variables</h3>';
            html += '<div>';
            envVars.forEach(env => {
                html += `
                    <div style="background: var(--bg-color); padding: 12px; margin: 8px 0; border-radius: 8px;">
                        <code>${escapeHtml(env.key)}</code> = <code>${escapeHtml(env.value)}</code>
                    </div>
                `;
            });
            html += '</div>';
        }
        
        content.innerHTML = html;
        document.getElementById('viewProjectModal').classList.add('show');
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

function closeViewProjectModal() {
    document.getElementById('viewProjectModal').classList.remove('show');
}

// Delete Session
async function deleteSession(sessionId) {
    try {
        await supabaseRequest(`active_sessions?id=eq.${sessionId}`, 'DELETE');
        loadSessions();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    console.log('🔐 Admin Dashboard Initialized');
});
