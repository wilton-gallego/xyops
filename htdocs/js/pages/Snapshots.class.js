Page.Snapshots = class Snapshots extends Page.Base {
	
	onInit() {
		// called once at page load
		this.default_sub = 'list';
	}
	
	onActivate(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		if (!args.sub) args.sub = this.default_sub;
		this.args = args;
		
		app.showSidebar(true);
		
		this.loading();
		this['gosub_'+args.sub](args);
		
		return true;
	}
	
	gosub_list(args) {
		// snapshot history / search
		var self = this;
		var args = this.args;
		
		if (!args.offset) args.offset = 0;
		if (!args.limit) args.limit = 25;
		
		app.setWindowTitle('Snapshot History');
		app.setHeaderTitle( '<i class="mdi mdi-monitor-screenshot">&nbsp;</i>Snapshot History' ); // or: cloud-snapshot-outline
		
		var html = '';
		html += '<div class="box" style="border:none;">';
		html += '<div class="box_content" style="padding:20px;">';
			
			// options
			html += '<div id="d_s_adv" class="form_grid" style="margin-bottom:25px">';
				
				// source
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-palette-swatch-outline">&nbsp;</i>Snapshot Source:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_source',
							title: 'Select Source',
							placeholder: 'All Sources',
							options: [['', 'Any Source'], ['alert', 'Alert'], ['user', 'User'], ['watch', 'Watch']],
							value: args.source || '',
							default_icon: 'palette-swatch-outline',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// server
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-router-network">&nbsp;</i>Server:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_server',
							title: 'Select Server',
							placeholder: 'All Servers',
							options: [['', 'Any Server']].concat( sort_by(Object.values(app.servers), 'hostname').map( function(server) {
								return merge_objects( { title: server.hostname }, server );
							} ) ),
							value: args.server || '',
							default_icon: 'router-network',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// group
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-server-network">&nbsp;</i>Group:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_group',
							title: 'Select Group',
							placeholder: 'All Groups',
							options: [['', 'Any Group']].concat( app.groups ),
							value: args.group || '',
							default_icon: 'server-network',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// date
				html += '<div class="form_cell">';
					var date_items = [
						['', 'All Dates'],
						['now', 'This Hour'],
						['lasthour', 'Last Hour'],
						['today', 'Today'],
						['yesterday', 'Yesterday'],
						['month', 'This Month'],
						['lastmonth', 'Last Month'],
						['year', 'This Year'],
						['lastyear', 'Last Year'],
						['older', 'Older']
					];
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-calendar-multiple">&nbsp;</i>Date Range:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_date',
							title: 'Date Range',
							options: date_items.map( function(item) { 
								return item[0] ? { id: item[0], title: item[1], icon: 'calendar-range' } : item; 
							} ),
							value: args.date,
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// sort
				html += '<div class="form_cell">';
					var sort_items = [
						{ id: 'date_desc', title: 'Newest', icon: 'sort-descending' },
						{ id: 'date_asc', title: 'Oldest', icon: 'sort-ascending' }
					];
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-sort">&nbsp;</i>Sort Results:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_sort',
							title: 'Sort Results',
							options: sort_items,
							value: args.sort,
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
			html += '</div>'; // form_grid
		
		// buttons at bottom
		html += '<div class="box_buttons" style="padding:0">';
			html += '<div class="button primary" onMouseUp="$P().navSearch()"><i class="mdi mdi-magnify">&nbsp;</i>Search</div>';
			// html += '<div class="clear"></div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box_content
		html += '</div>'; // box
		
		html += '<div id="d_search_results"><div class="loading_container"><div class="loading"></div></div></div>';
		
		this.div.html( html );
		
		var sargs = this.getSearchArgs();
		
		SingleSelect.init( this.div.find('#fe_ss_source, #fe_ss_server, #fe_ss_group, #fe_ss_date, #fe_ss_sort') );
		// $('.header_search_widget').hide();
		
		this.div.find('#fe_ss_source, #fe_ss_server, #fe_ss_group, #fe_ss_date, #fe_ss_sort').on('change', function() {
			self.navSearch();
		});
		
		this.doSearch();
		
		return true;
	}
	
	getSearchArgs() {
		// get form values, return search args object
		var args = {};
		
		var source = this.div.find('#fe_ss_source').val();
		if (source) args.source = source;
		
		var server = this.div.find('#fe_ss_server').val();
		if (server) args.server = server;
		
		var group = this.div.find('#fe_ss_group').val();
		if (group) args.group = group;
		
		var date = this.div.find('#fe_ss_date').val();
		if (date) args.date = date;
		
		var sort = this.div.find('#fe_ss_sort').val();
		if (sort != 'date_desc') args.sort = sort;
		
		if (!num_keys(args)) return null;
		
		return args;
	}
	
	navSearch() {
		// convert form into query and redirect
		app.clearError();
		
		var args = this.getSearchArgs();
		if (!args) {
			Nav.go( this.selfNav({}) );
			return;
		}
		
		Nav.go( this.selfNav(args) );
	}
	
	getSearchQuery(args) {
		// construct actual unbase simple query syntax
		var query = '';
		
		if (args.source) query += ' source:' + args.source;
		if (args.server) query += ' server:' + args.server;
		if (args.group) query += ' group:' + args.group;
		
		if (args.date) {
			query += ' ' + this.getDateRangeQuery('date', args.date);
		}
		
		return query.trim();
	}
	
	doSearch() {
		// actually perform the search
		var args = this.args;
		var query = this.getSearchQuery(args);
		
		// compose search query
		this.records = [];
		this.opts = {
			query: query.trim(),
			offset: args.offset || 0,
			limit: args.limit || config.items_per_page,
			compact: 1
		};
		switch (args.sort) {
			case 'date_asc':
				this.opts.sort_by = '_id'; 
				this.opts.sort_dir = 1;
			break;
			
			case 'date_desc':
				this.opts.sort_by = '_id'; 
				this.opts.sort_dir = -1;
			break;
		} // sort
		
		app.api.get( 'app/search_snapshots', this.opts, this.receiveResults.bind(this) );
	}
	
	receiveResults(resp) {
		// receive search results
		var self = this;
		var $results = this.div.find('#d_search_results');
		var html = '';
		
		if (!this.active) return; // sanity
		
		this.lastSearchResp = resp;
		this.snapshots = [];
		if (resp.rows) this.snapshots = resp.rows;
		
		var grid_args = {
			resp: resp,
			cols: ["Snapshot ID", "Source", "Server", "Uptime", "Load Avg", "Mem Avail", "Date/Time"],
			data_type: 'snapshot',
			offset: this.args.offset || 0,
			limit: this.args.limit,
			pagination_link: '$P().searchPaginate'
		};
		
		html += '<div class="box">';
		
		html += '<div class="box_title" style="' + (this.snapshots.length ? 'padding-bottom:10px' : '') + '">';
			html += this.getSearchArgs() ? 'Search Results' : 'All Snapshots';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		html += '<div class="box_content table">';
		
		html += this.getPaginatedGrid( grid_args, function(item, idx) {
			if (!item.data) item.data = {}; // sanity
			if (!item.data.memory) item.data.memory = {}; // sanity
			
			return [
				'<b>' + self.getNiceSnapshotID(item, true) + '</b>',
				self.getNiceSnapshotSource(item),
				self.getNiceServer(item.server, true),
				get_text_from_seconds(item.data.uptime_sec || 0, true, true),
				item.data.load.map( function(avg) { return short_float(avg); } ).join(', '),
				get_text_from_bytes(item.data.memory.available || 0),
				self.getNiceDateTime(item.date)
			];
		} );
		
		html += '</div>'; // box_content
		html += '</div>'; // box
		
		$results.html( html );
	}
	
	searchPaginate(offset) {
		// special hook for intercepting pagination clicks
		// FUTURE: history.replaceState to update the URI with new offset
		this.args.offset = offset;
		this.doSearch();
	}
	
	gosub_view(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		this.args = args;
		
		app.showSidebar(true);
		app.setHeaderTitle( '...' );
		
		this.snapshot = null;
		
		this.loading();
		app.api.get( 'app/search_snapshots', { query: '#id:' + args.id, verbose: 1 }, this.receive_snapshot.bind(this), this.fullPageError.bind(this) );
		return true;
	}
	
	receive_snapshot(resp) {
		// render snapshot details
		var self = this;
		var html = '';
		
		// make sure page is still active (API may be slow)
		if (!this.active) return;
		
		var snapshot = this.snapshot = resp.rows.shift();
		if (!snapshot) return this.doFullPageError("Snapshot ID not found: " + this.args.id);
		
		var icon = '<i class="mdi mdi-monitor-screenshot">&nbsp;</i>';
		
		// this.div.html( '<pre>' + encode_entities( JSON.stringify(snapshot, null, "\t") ) + '</pre>' );
		
		app.setHeaderTitle( icon + 'Snapshot Details' );
		app.setWindowTitle( "Viewing Snapshot #" + (this.snapshot.id) + "" );
		
		html += '<div class="box">';
			html += '<div class="box_title">';
				html += 'Summary';
				
				html += '<div class="button right danger" onMouseUp="$P().showDeleteSnapshotDialog()"><i class="mdi mdi-trash-can-outline">&nbsp;</i>Delete...</div>';
				// html += '<div class="button secondary right" onMouseUp="$P().do_edit_from_view()"><i class="mdi mdi-file-edit-outline">&nbsp;</i>Edit Event...</div>';
				// html += '<div class="button right" onMouseUp="$P().do_run_from_view()"><i class="mdi mdi-run-fast">&nbsp;</i>Run Now</div>';
				html += '<div class="clear"></div>';
			html += '</div>'; // title
			
			html += '<div class="box_content table">';
				html += '<div class="summary_grid">';
				
					// row 1
					html += '<div>';
						html += '<div class="info_label">Snapshot ID</div>';
						html += '<div class="info_value">' + this.getNiceSnapshotID(snapshot, false) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Server</div>';
						html += '<div class="info_value">' + this.getNiceServer(snapshot.server, true) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Source</div>';
						html += '<div class="info_value">' + this.getNiceSnapshotSource(snapshot) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Date/Time</div>';
						html += '<div class="info_value">' + this.getNiceDateTime(snapshot.date) + '</div>';
					html += '</div>';
					
					// row 2
					html += '<div>';
						html += '<div class="info_label">Group</div>';
						html += '<div class="info_value">' + this.getNiceGroup(snapshot.group, true) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">IP Address</div>';
						html += '<div class="info_value">' + this.getNiceIP(snapshot.ip) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Architecture</div>';
						html += '<div class="info_value">' + this.getNiceArch(snapshot.data.arch) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Operating System</div>';
						html += '<div class="info_value">' + this.getNiceOS(snapshot.data.os) + '</div>';
					html += '</div>';
					
					// row 3
					html += '<div>';
						html += '<div class="info_label">Total RAM</div>';
						html += '<div class="info_value">' + get_text_from_bytes(snapshot.data.memory.total || 0) + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">CPU Cores</div>';
						html += '<div class="info_value">' + snapshot.data.cpu.physicalCores + ' physical, ' + snapshot.data.cpu.cores + ' virtual</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">CPU Type</div>';
						html += '<div class="info_value">' + snapshot.data.cpu.vendor + ' ' + snapshot.data.cpu.brand + '</div>';
					html += '</div>';
					
					html += '<div>';
						html += '<div class="info_label">Server Uptime</div>';
						html += '<div class="info_value">' + get_text_from_seconds(snapshot.data.uptime_sec, false, true) + '</div>';
					html += '</div>';
					
				html += '</div>'; // summary grid
			html += '</div>'; // box content
		html += '</div>'; // box
		
		// alerts
		html += '<div class="box" id="d_vs_alerts" style="display:none">';
			html += '<div class="box_title">';
				html += 'Snapshot Alerts';
			html += '</div>';
			html += '<div class="box_content table">';
				html += '<div class="loading_container"><div class="loading"></div></div>';
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// jobs
		html += '<div class="box" id="d_vs_jobs" style="display:none">';
			html += '<div class="box_title">';
				html += 'Snapshot Jobs';
			html += '</div>';
			html += '<div class="box_content table">';
				html += '<div class="loading_container"><div class="loading"></div></div>';
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// monitor dash grid
		html += '<div class="dash_grid">';
			html += this.getMonitorGrid(snapshot);
		html += '</div>';
		
		// mem details
		html += '<div class="box" id="d_vs_mem">';
			html += '<div class="box_title">';
				html += 'Memory Details';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getMemDetails(snapshot);
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// cpu details
		html += '<div class="box" id="d_vs_cpus">';
			html += '<div class="box_title">';
				html += 'CPU Details';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getCPUDetails(snapshot);
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// processes
		var proc_opts = {
			id: 't_snap_procs',
			item_name: 'process',
			sort_by: 'cpu',
			sort_dir: -1,
			filter: '',
			column_ids: ['command', 'user', 'pid', 'parentPid', 'cpu', 'memRss', 'age', 'state'],
			column_labels: ['Command', 'User', 'PID', 'Parent', 'CPU', 'Memory', 'Age', 'State']
		};
		
		html += '<div class="box" id="d_vs_procs">';
			html += '<div class="box_title">';
				html += '<div class="box_title_widget" style="overflow:visible; margin-left:0;"><i class="mdi mdi-magnify" onMouseUp="$(this).next().focus()">&nbsp;</i><input type="text" placeholder="Filter" value="" data-id="' + proc_opts.id + '" onInput="$P().applyTableFilter(this)"></div>';
				html += 'Active Processes';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getSortableTable( snapshot.data.processes.list, proc_opts, function(proc) {
					return [
						'<b>' + self.getNiceProcess(proc, true) + '</b>',
						proc.user,
						'<span class="link" onClick="$P().showProcessInfo(' + proc.pid + ')">' + proc.pid + '</span>',
						proc.parentPid ? ('<span class="link" onClick="$P().showProcessInfo(' + proc.parentPid + ')">' + proc.parentPid + '</span>') : 'n/a',
						pct( proc.cpu, 100 ),
						get_text_from_bytes( proc.memRss ),
						get_text_from_seconds( proc.age || 0, true, true ),
						ucfirst(proc.state || 'unknown')
					];
				});
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// connections
		var conn_opts = {
			id: 't_snap_conns',
			item_name: 'connection',
			sort_by: 'state',
			sort_dir: 1,
			filter: '',
			column_ids: ['type', 'state', 'local_addr', 'remote_addr', 'command', 'bytes_in', 'bytes_out'],
			column_labels: ['Protocol', 'State', 'Local Address', 'Remote Address', 'Process', 'Bytes In', 'Bytes Out']
		};
		
		html += '<div class="box" id="d_vs_conns">';
			html += '<div class="box_title">';
				html += '<div class="box_title_widget" style="overflow:visible; margin-left:0;"><i class="mdi mdi-magnify" onMouseUp="$(this).next().focus()">&nbsp;</i><input type="text" placeholder="Filter" value="" data-id="' + conn_opts.id + '" onInput="$P().applyTableFilter(this)"></div>';
				html += 'Network Connections';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getSortableTable( snapshot.data.conns, conn_opts, function(conn) {
					var nice_state = conn.state.toString().split(/_/).map( function(word) { return ucfirst(word); } ).join(' ');
					var proc = conn.pid ? find_object(snapshot.data.processes.list, { pid: conn.pid }) : null;
					return [
						conn.type.toUpperCase(),
						nice_state,
						conn.local_addr,
						conn.remote_addr,
						proc ? self.getNiceProcess(proc, true) : (conn.pid || '(None)'),
						get_text_from_bytes( conn.bytes_in || 0 ),
						get_text_from_bytes( conn.bytes_out || 0 )
					];
				});
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// network interfaces
		var iface_opts = {
			id: 't_snap_ifaces',
			item_name: 'interface',
			sort_by: 'iface',
			sort_dir: 1,
			filter: '',
			column_ids: ['iface', 'ip4', 'ip6', 'operstate', 'type', 'speed', 'rx_sec', 'tx_sec'],
			column_labels: ['Name', 'IPv4', 'IPv6', 'State', 'Type', 'Speed', 'Bytes In', 'Bytes Out']
		};
		
		html += '<div class="box" id="d_vs_ifaces">';
			html += '<div class="box_title">';
				html += '<div class="box_title_widget" style="overflow:visible; margin-left:0;"><i class="mdi mdi-magnify" onMouseUp="$(this).next().focus()">&nbsp;</i><input type="text" placeholder="Filter" value="" data-id="' + iface_opts.id + '" onInput="$P().applyTableFilter(this)"></div>';
				html += 'Network Interfaces';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getSortableTable( Object.values(snapshot.data.interfaces), iface_opts, function(iface) {
					var nice_speed = 'n/a';
					if (iface.speed && (iface.speed >= 1000000)) nice_speed = Math.floor(iface.speed / 1000000) + ' Tb';
					else if (iface.speed && (iface.speed >= 1000)) nice_speed = Math.floor(iface.speed / 1000) + ' Gb';
					else if (iface.speed) nice_speed = iface_speed + ' Mb';
					
					return [
						iface.iface,
						iface.ip4 || 'n/a',
						iface.ip6 || 'n/a',
						ucfirst(iface.operstate || 'Unknown'),
						ucfirst(iface.type || 'Unknown'),
						nice_speed,
						get_text_from_bytes( iface.rx_sec || 0 ) + '/sec',
						get_text_from_bytes( iface.tx_sec || 0 ) + '/sec'
					];
				});
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		// mounts
		var fs_opts = {
			id: 't_snap_fs',
			item_name: 'mount',
			sort_by: 'mount',
			sort_dir: 1,
			filter: '',
			column_ids: ['mount', 'type', 'fs', 'size', 'used', 'avail', 'use'],
			column_labels: ['Mount Point', 'Type', 'Device', 'Total Size', 'Used', 'Available', 'Use %']
		};
		
		html += '<div class="box" id="d_vs_fs">';
			html += '<div class="box_title">';
				html += '<div class="box_title_widget" style="overflow:visible; margin-left:0;"><i class="mdi mdi-magnify" onMouseUp="$(this).next().focus()">&nbsp;</i><input type="text" placeholder="Filter" value="" data-id="' + fs_opts.id + '" onInput="$P().applyTableFilter(this)"></div>';
				html += 'Filesystems';
			html += '</div>';
			html += '<div class="box_content table">';
				html += this.getSortableTable( Object.values(snapshot.data.mounts), fs_opts, function(item) {
					return [
						'<span class="">' + item.mount + '</span>',
						item.type,
						item.fs,
						get_text_from_bytes( item.size ),
						get_text_from_bytes( item.used ),
						get_text_from_bytes( item.available ),
						self.getNiceProgressBar( item.use / 100, 'static', true )
					];
				});
			html += '</div>'; // box_content
		html += '</div>'; // box
		
		this.div.html(html);
		
		this.getSnapshotAlerts();
		this.getSnapshotJobs();
	}
	
	showProcessInfo(pid) {
		// pop dialog with process details
		var self = this;
		var html = '';
		var list = this.snapshot.data.processes.list;
		var proc = find_object( list, { pid } );
		if (!proc) return; // sanity
		
		var cmd = '';
		if (proc.path) cmd += proc.path + '/';
		cmd += proc.command;
		if (proc.params) cmd += ' ' + proc.params;
		
		html += '<div class="dialog_box_content maximize" style="width:600px; max-height:75vh; overflow-x:hidden; overflow-y:auto;">';
		
		// command
		html += '<div class="summary_grid single" style="margin-top:10px; margin-bottom:20px;">';
			html += '<div>';
				html += '<div class="info_label">Command</div>';
				html += '<div class="info_value overflow" style="word-break:break-word;">' + cmd + '</div>';
			html += '</div>';
		html += '</div>';
		
		// grid
		html += '<div class="summary_grid triple">';
		
		// pid
		html += '<div>';
			html += '<div class="info_label">Process ID</div>';
			html += '<div class="info_value">' + proc.pid + '</div>';
		html += '</div>';
		
		// parent pid
		if (proc.parentPid) {
			html += '<div>';
				html += '<div class="info_label">Parent PID</div>';
				html += '<div class="info_value"><span class="link" onClick="$P().showProcessInfo(' + proc.parentPid + ')">' + proc.parentPid + '</span></div>';
			html += '</div>';
		}
		
		// user
		html += '<div>';
			html += '<div class="info_label">User</div>';
			html += '<div class="info_value">' + (proc.user || 'n/a') + '</div>';
		html += '</div>';
		
		// cpu
		html += '<div>';
			html += '<div class="info_label">CPU %</div>';
			html += '<div class="info_value">' + short_float(proc.cpu || 0) + '%</div>';
		html += '</div>';
		
		// cpuu (user)
		html += '<div>';
			html += '<div class="info_label">CPU % (User)</div>';
			html += '<div class="info_value">' + short_float(proc.cpuu || 0) + '%</div>';
		html += '</div>';
		
		// cpus (system)
		html += '<div>';
			html += '<div class="info_label">CPU % (System)</div>';
			html += '<div class="info_value">' + short_float(proc.cpus || 0) + '%</div>';
		html += '</div>';
		
		// mem (%)
		html += '<div>';
			html += '<div class="info_label">Memory %</div>';
			html += '<div class="info_value">' + short_float(proc.mem || 0) + '%</div>';
		html += '</div>';
		
		// memVsz (virtual)
		html += '<div>';
			html += '<div class="info_label">Virtual Memory</div>';
			html += '<div class="info_value">' + get_text_from_bytes(proc.memVsz || 0) + '</div>';
		html += '</div>';
		
		// memRss (resident)
		html += '<div>';
			html += '<div class="info_label">Resident Memory</div>';
			html += '<div class="info_value">' + get_text_from_bytes(proc.memRss || 0) + '</div>';
		html += '</div>';
		
		// started (age)
		html += '<div>';
			html += '<div class="info_label">Age</div>';
			html += '<div class="info_value">' + get_text_from_seconds( proc.age || 0, false, true ) + '</div>';
		html += '</div>';
		
		// state
		html += '<div>';
			html += '<div class="info_label">State</div>';
			html += '<div class="info_value">' + ucfirst(proc.state) + '</div>';
		html += '</div>';
		
		// tty
		html += '<div>';
			html += '<div class="info_label">TTY</div>';
			html += '<div class="info_value">' + (proc.tty || 'n/a') + '</div>';
		html += '</div>';
		
		// priority
		html += '<div>';
			html += '<div class="info_label">Priority</div>';
			html += '<div class="info_value">' + (proc.priority || 'n/a') + '</div>';
		html += '</div>';
		
		// nice
		html += '<div>';
			html += '<div class="info_label">Nice</div>';
			html += '<div class="info_value">' + (proc.nice || 'n/a') + '</div>';
		html += '</div>';
		
		if (proc.job) {
			// job id
			html += '<div>';
				html += '<div class="info_label">Job ID</div>';
				html += '<div class="info_value">' + this.getNiceJob(proc.job, true) + '</div>';
			html += '</div>';
			
			// disk
			html += '<div>';
				html += '<div class="info_label">Total I/O</div>';
				html += '<div class="info_value">' + get_text_from_bytes(proc.disk || 0) + '</div>';
			html += '</div>';
			
			// conns
			html += '<div>';
				html += '<div class="info_label">Net Connections</div>';
				html += '<div class="info_value">' + commify(proc.conns || 0) + '</div>';
			html += '</div>';
			
			// net
			html += '<div>';
				html += '<div class="info_label">Net Throughput</div>';
				html += '<div class="info_value">' + get_text_from_bytes(proc.net || 0) + '/sec</div>';
			html += '</div>';
		}
		
		html += '</div>'; // summary_grid
		
		// process family tree
		var rows = [ copy_object(proc) ];
		
		// add children
		var add_children = function(parent, indent) {
			find_objects(list, { parentPid: parent.pid }).forEach( function(proc) {
				rows.push( merge_objects(proc, { indent }) );
				add_children( proc, indent + 1 );
			} );
		};
		add_children( proc, 1 );
		
		// add parents
		var add_parents = function(proc) {
			var parent = find_object(list, { pid: proc.parentPid });
			if (parent) {
				rows.forEach( function(row) { row.indent = (row.indent || 0) + 1; } );
				rows.unshift( copy_object(parent) );
				add_parents(parent);
			}
		};
		add_parents( proc );
		
		if (rows.length > 1) {
			// html += '<div class="dialog_title" style="margin-top:30px; margin-bottom:10px;">Process Family</div>';
			html += '<div style="margin-top:35px;"></div>';
			
			var opts = {
				rows: rows,
				cols: ['Command', 'User', 'PID'],
				data_type: 'process',
				hide_pagination: true
			};
			html += this.getBasicGrid( opts, function(item, idx) {
				var indent_px = Math.floor( (item.indent || 0) * 16 );
				
				var cmd = '<span style="padding-left:' + Math.floor(indent_px - 16) + 'px;">';
				if (indent_px) cmd += '<i class="mdi mdi-subdirectory-arrow-right" style="color:var(--icon-color);">&nbsp;</i>';
				if (item.pid == proc.pid) cmd += '<b>';
				cmd += self.getNiceProcess(item, true);
				if (item.pid == proc.pid) cmd += '</b>';
				cmd += '</span>';
				
				return [
					cmd,
					item.user,
					item.pid
				];
			} ); // grid (procs)
		} // family
		
		html += '</div>'; // wrapper
		
		var buttons_html = "";
		// buttons_html += '<div class="button" onMouseUp="$P().copy_unit_results('+idx+')">Copy to Clipboard</div>';
		buttons_html += '<div class="button primary" onMouseUp="Dialog.confirm_click(true)">Close</div>';
		
		Dialog.showSimpleDialog('Process Details', html, buttons_html);
		
		// special mode for key capture
		Dialog.active = 'confirmation';
		Dialog.confirm_callback = function(result) { 
			if (result) Dialog.hide(); 
		};
	}
	
	getMemDetails(server) {
		// get memory details
		var self = this;
		var data = server.data;
		var html = '';
		var mem = data.memory;
		
		/* "memory": {
			"total": 8318783488,
			"free": 7249416192,
			"used": 1069367296,
			"active": 926904320,
			"available": 7391879168,
			"buffers": 335872,
			"cached": 431300608,
			"slab": 53968896,
			"buffcache": 485605376,
			"swaptotal": 10466258944,
			"swapused": 0,
			"swapfree": 10466258944,
			"writeback": 0,
			"dirty": 102400
		}, */
		
		html += '<div class="dash_donut_grid">';
			html += this.getDonutDashUnit({ value: mem.used, max: mem.total, type: 'bytes', suffix: '', label: 'Used', color: app.colors[2] });
			html += this.getDonutDashUnit({ value: mem.active, max: mem.total, type: 'bytes', suffix: '', label: 'Active', color: app.colors[3] });
			html += this.getDonutDashUnit({ value: mem.available, max: mem.total, type: 'bytes', suffix: '', label: 'Available', color: app.colors[0] });
			html += this.getDonutDashUnit({ value: mem.free, max: mem.total, type: 'bytes', suffix: '', label: 'Free', color: app.colors[1] });
			html += this.getDonutDashUnit({ value: mem.buffers, max: mem.total, type: 'bytes', suffix: '', label: 'Buffered', color: app.colors[4] });
			html += this.getDonutDashUnit({ value: mem.cached, max: mem.total, type: 'bytes', suffix: '', label: 'Cached', color: app.colors[5] });
		html += '</div>';
		
		return html;
	}
	
	getCPUDetails(server) {
		// get table of individual cpu details
		var self = this;
		var data = server.data;
		var html = '';
		var cpu_totals = data.cpu.totals;
		
		html += '<div class="dash_donut_grid">';
			html += this.getDonutDashUnit({ value: cpu_totals.user, max: 100, type: 'float', suffix: '%', label: 'User %', color: app.colors[6] });
			html += this.getDonutDashUnit({ value: cpu_totals.system, max: 100, type: 'float', suffix: '%', label: 'System %', color: app.colors[7] });
			html += this.getDonutDashUnit({ value: cpu_totals.nice, max: 100, type: 'float', suffix: '%', label: 'Nice %', color: app.colors[8] });
			html += this.getDonutDashUnit({ value: cpu_totals.iowait, max: 100, type: 'float', suffix: '%', label: 'I/O Wait %', color: app.colors[9] });
			html += this.getDonutDashUnit({ value: cpu_totals.irq, max: 100, type: 'float', suffix: '%', label: 'Hard IRQ %', color: app.colors[10] });
			html += this.getDonutDashUnit({ value: cpu_totals.softirq, max: 100, type: 'float', suffix: '%', label: 'Soft IRQ %', color: app.colors[11] });
		html += '</div>';
		
		html += '<div style="height:30px;"></div>';
		
		var cpus = (data.cpu && data.cpu.cpus) ? data.cpu.cpus : {};
		var sorted_keys = Object.keys(cpus).sort( function(a, b) {
			return parseInt( a.replace(/^cpu/, '') ) - parseInt( b.replace(/^cpu/, '') );
		} );
		var rows = sorted_keys.map( function(key) { return cpus[key]; } );
		
		var cols = ['CPU #', 'User %', 'System %', 'Nice %', 'I/O Wait %', 'Hard IRQ %', 'Soft IRQ %', 'Total %'];
		
		var grid_args = {
			rows: rows,
			cols: cols,
			data_type: 'cpu'
		};
		
		html += this.getBasicGrid( grid_args, function(item, idx) {
			return [
				'#' + Math.floor(idx + 1),
				short_float(item.user) + '%',
				short_float(item.system) + '%',
				short_float(item.nice) + '%',
				short_float(item.iowait) + '%',
				short_float(item.irq) + '%',
				short_float(item.softirq) + '%',
				self.getNiceProgressBar( (100 - item.idle) / 100, 'static', true )
			];
		}); // grid
		
		return html;
	}
	
	getMonitorGrid(server) {
		// get grid of monitor dash units, sorted
		var self = this;
		var data = server.data;
		var html = '';
		
		app.monitors.forEach( function(mon_def) {
			if (!mon_def.display) return;
			if (mon_def.groups.length && !mon_def.groups.includes(server.group)) return;
			
			var label = mon_def.title
				.replace(/\b(Total)\b/g, '')
				.replace(/\b(Average)\b/g, 'Avg')
				.replace(/\b(Operations)\b/g, 'Ops')
				// .replace(/\b(Network)\b/g, 'Net')
				.replace(/\b(Connections)\b/g, 'Conns')
				.replace(/\b(Available)\b/g, 'Avail')
				.replace(/\b(Memory)\b/g, 'Mem')
				// .replace(/\b(Processes)\b/g, 'Procs')
				.replace(/\(.+\)/g, '')
				.replace(/\%/g, '')
				.replace(/\s+/g, ' ').trim();
			
			var value = (mon_def.delta ? data.deltas[mon_def.id] : data.monitors[mon_def.id]) || 0;
			var value_disp = self.getDashValue(value, mon_def.data_type, mon_def.suffix);
			
			html += '<div class="dash_unit_box">';
				html += '<div class="dash_unit_value">' + value_disp + '</div>';
				html += '<div class="dash_unit_label">' + label + '</div>';
			html += '</div>';
		} );
		
		return html;
	}
	
	getDashValue(value, type, suffix) {
		// format number value for dashboard units
		var value_disp = '';
		
		switch (type) {
			case 'integer': value_disp = this.getNiceDashNumber(value); break;
			case 'float': value_disp = short_float(value); break;
			case 'bytes': value_disp = get_text_from_bytes_dash(value); break;
			case 'seconds': value_disp = get_text_from_seconds_round(value, 2); break;
			case 'milliseconds': value_disp = get_text_from_ms_round(value, 2); break;
		} // switch data_type
		
		if (suffix) value_disp += suffix.replace(/^\s*\/(\w)\w+$/, '/$1');
		
		return value_disp;
	}
	
	getDonutDashUnit(opts) {
		// get donut dash unit
		// opts: { value, max, type, suffix, label, color }
		var html = '';
		var amount = opts.value / (opts.max || 1);
		var pct = amount * 100;
		var value_disp = this.getDashValue(opts.value, opts.type, opts.suffix);
		
		html += '<div class="dash_donut_container">';
			html += '<div class="dash_donut_image" style="background-image:conic-gradient( ' + opts.color + ' ' + pct + '%, var(--border-color) 0);">';
				html += '<div class="dash_donut_overlay"></div>';
				html += '<div class="dash_donut_value">' + value_disp + '</div>';
			html += '</div>';
			html += '<div class="dash_donut_label">' + opts.label + '</div>';
		html += '</div>';
		
		return html;
	}
	
	getSnapshotAlerts() {
		// fetch alerts associated with snapshot
		var self = this;
		var snapshot = this.snapshot;
		
		if (!snapshot.alerts || !snapshot.alerts.length) {
			this.alerts = [];
			return this.renderSnapshotAlerts();
		}
		
		app.api.post( 'app/get_alert_invocations', { ids: snapshot.alerts }, function(resp) {
			self.alerts = resp.alerts || [];
			self.renderSnapshotAlerts();
		});
	}
	
	renderSnapshotAlerts() {
		// render details on snapshot alerts
		var self = this;
		
		// make sure page is still active (API may be slow)
		if (!this.active) return;
		
		if (!this.alerts || !this.alerts.length) {
			$('#d_vs_alerts').hide();
			return;
		}
		
		var alerts = this.alerts;
		var cols = ["Alert ID", "Title", "Message", "Server", "Status", "Started", "Duration"];
		var html = '';
		
		var grid_args = {
			rows: alerts,
			cols: cols,
			data_type: 'alert'
		};
		
		html += this.getBasicGrid( grid_args, function(item, idx) {
			return [
				'<b>' + self.getNiceAlertID(item, true) + '</b>',
				self.getNiceAlert(item.alert, false),
				item.message,
				self.getNiceServer(item.server, false),
				self.getNiceAlertStatus(item),
				self.getNiceDateTime(item.date),
				self.getNiceAlertElapsedTime(item, true, true)
			];
		}); // grid
		
		this.div.find('#d_vs_alerts > div.box_content').html( html );
		this.div.find('#d_vs_alerts').show();
	}
	
	getSnapshotJobs() {
		// fetch info about all snapshot jobs
		var self = this;
		var snapshot = this.snapshot;
		
		if (!snapshot.jobs || !snapshot.jobs.length) {
			this.jobs = [];
			return this.renderSnapshotJobs();
		}
		
		app.api.post( 'app/get_jobs', { ids: snapshot.jobs }, function(resp) {
			self.jobs = resp.jobs || [];
			self.renderSnapshotJobs();
		});
	}
	
	renderSnapshotJobs() {
		// render snapshot jobs
		var self = this;
		var html = '';
		
		// make sure page is still active (API may be slow)
		if (!this.active) return;
		
		var grid_args = {
			rows: this.jobs,
			cols: ['Job ID', 'Server', 'Source', 'Started', 'Elapsed', 'Avg CPU/Mem', 'Result'],
			data_type: 'job',
			class: 'data_grid job_history_grid'
		};
		
		html += this.getBasicGrid( grid_args, function(job, idx) {
			return [
				'<b>' + self.getNiceJob(job.id, true) + '</b>',
				self.getNiceServer(job.server, true),
				self.getNiceJobSource(job),
				self.getShortDateTime( job.started ),
				self.getNiceJobElapsedTime(job, true),
				self.getNiceJobAvgCPU(job) + ' / ' + self.getNiceJobAvgMem(job),
				self.getNiceJobResult(job),
				// '<a href="#Job?id=' + job.id + '">Details</a>'
			];
		} );
		
		this.div.find('#d_vs_jobs > .box_content').html( html );
		this.div.find('#d_vs_jobs').show();
	}
	
	showDeleteSnapshotDialog() {
		// delete snapshot invocation after user confirmation
		var self = this;
		var snapshot = this.snapshot;
		
		Dialog.confirmDanger( 'Delete Snapshot', "Are you sure you want to permanently delete the current snapshot?  There is no way to undo this operation.", 'Delete', function(result) {
			if (!result) return;
			app.clearError();
			Dialog.showProgress( 1.0, "Deleting Snapshot..." );
			
			app.api.post( 'app/delete_snapshot', { id: snapshot.id }, function(resp) {
				Dialog.hideProgress();
				app.showMessage('success', "Snapshot ID &ldquo;<b>" + snapshot.id + "</b>&rdquo; was deleted successfully.");
				
				if (!self.active) return; // sanity
				
				Nav.go('#Snapshots?sub=list');
			} ); // api.post
		} ); // confirm
	}
	
	//
	// Sortble grid stuff -- might move to base if used elsewhere...
	//
	
	getSortedTableRows(id) {
		// get sorted (and filtered!) table rows
		var opts = this.tables[id];
		var filter_re = new RegExp( escape_regexp(opts.filter) || '.*', 'i' );
		var sort_by = opts.sort_by;
		var sort_dir = opts.sort_dir;
		var sort_type = 'number';
		if (opts.rows.length && (typeof(opts.rows[0][sort_by]) == 'string')) sort_type = 'string';
		
		// apply filter
		var rows = opts.rows.filter( function(row) {
			var blob = hash_values_to_array(row).join(' ');
			return !!blob.match( filter_re );
		} );
		
		// apply custom sort
		rows.sort( function(a, b) {
			if (sort_type == 'number') {
				return( (a[sort_by] - b[sort_by]) * sort_dir );
			}
			else {
				return( a[sort_by].toString().localeCompare(b[sort_by]) * sort_dir );
			}
		});
		
		return rows;
	}
	
	applyTableFilter(elem) {
		// key typed in table filter box, redraw
		var id = $(elem).data('id');
		var opts = this.tables[id];
		opts.filter = $(elem).val();
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		// redraw pagination thing
		this.div.find('#st_hinfo_' + opts.id).html(
			this.getTableHeaderInfo(id, disp_rows) 
		);
		
		// redraw rows
		this.div.find('#st_' + opts.id).html( 
			this.getTableColumnHTML( opts.id ) + 
			this.getTableContentHTML( opts.id, disp_rows ) 
		);
	}
	
	getTableHeaderInfo(id, disp_rows) {
		// construct HTML for sortable table header info widget
		var opts = this.tables[id];
		var rows = opts.rows;
		var html = '';
		
		if (disp_rows.length < rows.length) {
			html += commify(disp_rows.length) + ' of ' + commify(rows.length) + ' ' + pluralize(opts.item_name, rows.length) + '';
		}
		else {
			html += commify(rows.length) + ' ' + pluralize(opts.item_name, rows.length) + '';
		}
		
		var bold_idx = opts.column_ids.indexOf( opts.sort_by );
		html += ', sorted by ' + opts.column_labels[bold_idx] + '';
		html += ' <i class="mdi mdi-menu-' + ((opts.sort_dir == 1) ? 'up' : 'down') + '"></i>';
		// html += ((opts.sort_dir == 1) ? ' ascending' : ' descending');
		
		return html;
	}
	
	getTableColumnHTML(id) {
		// construct HTML for sortable table column headers (THs)
		var opts = this.tables[id];
		var html = '';
		html += '<ul class="grid_row_header">';
		
		opts.column_ids.forEach( function(col_id, idx) {
			var col_label = opts.column_labels[idx];
			var classes = ['st_col_header'];
			var icon = '';
			if (col_id == opts.sort_by) {
				classes.push('active');
				icon = ' <i class="mdi mdi-menu-' + ((opts.sort_dir == 1) ? 'up' : 'down') + '"></i>';
			}
			html += '<div class="' + classes.join(' ') + '" data-id="' + opts.id + '" data-col="' + col_id + '" onMouseUp="$P().toggleTableSort(this)">' + col_label + icon + '</div>';
		});
		
		html += '</ul>';
		return html;
	}
	
	getTableContentHTML(id, disp_rows) {
		// construct HTML for sortable table content (rows)
		var opts = this.tables[id];
		var html = '';
		var bold_idx = opts.column_ids.indexOf( opts.sort_by );
		
		for (var idx = 0, len = disp_rows.length; idx < len; idx++) {
			var row = disp_rows[idx];
			var tds = opts.callback(row, idx);
			html += '<ul class="grid_row">';
			for (var idy = 0, ley = tds.length; idy < ley; idy++) {
				html += '<div' + ((bold_idx == idy) ? ' style="font-weight:bold"' : '') + '>' + tds[idy] + '</div>';
			}
			// html += '<td>' + tds.join('</td><td>') + '</td>';
			html += '</ul>';
		} // foreach row
		
		if (!disp_rows.length) {
			html += '<ul class="grid_row_empty"><div style="grid-column-start: span ' + opts.column_ids.length + ';">';
			html += 'No '+pluralize(opts.item_name)+' found.';
			html += '</div></ul>';
		}
		
		return html;
	}
	
	toggleTableSort(elem) {
		var id = $(elem).data('id');
		var col_id = $(elem).data('col');
		var opts = this.tables[id];
		
		// swap sort dir or change sort column
		if (col_id == opts.sort_by) {
			// swap dir
			opts.sort_dir *= -1;
		}
		else {
			// same sort dir but change column
			opts.sort_by = col_id;
		}
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		// redraw pagination thing
		this.div.find('#st_hinfo_' + opts.id).html(
			this.getTableHeaderInfo(id, disp_rows) 
		);
		
		// redraw grid
		this.div.find('#st_' + opts.id).html( 
			this.getTableColumnHTML(id) + 
			this.getTableContentHTML( opts.id, disp_rows ) 
		);
	}
	
	getSortableTable(rows, opts, callback) {
		// get HTML for sortable and filterable table
		var self = this;
		var html = '';
		
		// save in page for resort / filtering
		if (!this.tables) this.tables = {};
		opts.rows = rows;
		opts.callback = callback;
		this.tables[ opts.id ] = opts;
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		if (!opts.hide_pagination) {
			// pagination
			html += '<div class="data_grid_pagination">';
			
				html += '<div style="text-align:left" id="st_hinfo_' + opts.id + '">';
					html += this.getTableHeaderInfo( opts.id, disp_rows );
				html += '</div>';
				
				html += '<div style="text-align:center">';
					html += '&nbsp;';
				html += '</div>';
				
				html += '<div style="text-align:right">';
					html += 'Page 1 of 1';
				html += '</div>';
			
			html += '</div>';
			
			html += '<div style="margin-top:5px;">';
		}
		else {
			// no pagination
			html += '<div>';
		}
		
		var tattrs = opts.attribs || {};
		if (opts.class) tattrs.class = opts.class;
		if (!tattrs.class) {
			tattrs.class = 'data_grid';
			if (opts.item_name.match(/^\w+$/)) tattrs.class += ' ' + opts.item_name + '_grid';
		}
		if (!tattrs.style) tattrs.style = '';
		tattrs.style += 'grid-template-columns: repeat(' + opts.column_ids.length + ', auto);';
		html += '<div id="st_' + opts.id + '" ' + compose_attribs(tattrs) + '>';
		
			html += this.getTableColumnHTML( opts.id );
			html += this.getTableContentHTML( opts.id, disp_rows );
		
		html += '</div>'; // scroll wrapper
		html += '</div>'; // grid
		
		return html;
	}
	
	onDataUpdate(key, data) {
		// refresh things as needed
		switch (key) {
			case 'activeAlerts': this.getSnapshotAlerts(); break;
		}
	}
	
	onDeactivate() {
		// called when page is deactivated
		this.div.html( '' );
		
		delete this.lastSearchResp;
		delete this.snapshots;
		delete this.snapshot;
		delete this.alerts;
		delete this.jobs;
		delete this.tables;
		
		return true;
	}
	
};
