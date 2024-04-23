// Server List and Server Details

Page.Servers = class Servers extends Page.Base {
	
	onInit() {
		// called once at page load
		this.default_sub = 'list';
		this.dom_prefix = 'es';
	}
	
	onActivate(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		if (!args.sub) args.sub = this.default_sub;
		this.args = args;
		
		app.showSidebar(true);
		// app.setHeaderTitle( '<i class="mdi mdi-calendar-clock">&nbsp;</i>Scheduled Events' );
		
		this.loading();
		this['gosub_'+args.sub](args);
		
		return true;
	}
	
	gosub_list(args) {
		// show event list
		app.setWindowTitle( "Servers" );
		app.setHeaderTitle( '<i class="mdi mdi-desktop-classic">&nbsp;</i>Servers' );
		
		// this.loading();
		// app.api.post( 'app/get_events', copy_object(args), this.receive_events.bind(this) );
		
		var servers = Object.values(app.servers);
		
		// merge in recently offline servers
		for (var server_id in app.serverCache) {
			if (!app.servers[server_id]) {
				servers.push( merge_objects(app.serverCache[server_id], { offline: true }) );
			}
		}
		
		this.receive_servers({
			code: 0,
			rows: servers,
			list: { length: servers.length }
		});
	}
	
	receive_servers(resp) {
		// receive all servers, render them sorted
		var self = this;
		var args = this.args;
		var now = time_now();
		var html = '';
		
		// build opt groups for server props like OS, CPU, etc.
		var opt_groups = { os_platform: {}, os_distro: {}, os_release: {}, os_arch: {}, cpu_manufacturer: {}, cpu_brand: {}, cpu_cores: {} };
		
		resp.rows.forEach( function(server) {
			var info = server.info || {};
			if (!info.os) info.os = {};
			if (!info.cpu) info.cpu = {};
			
			if (info.os.platform) opt_groups.os_platform[ info.os.platform ] = 1;
			if (info.os.distro) opt_groups.os_distro[ info.os.distro ] = 1;
			if (info.os.release) opt_groups.os_release[ info.os.release ] = 1;
			if (info.os.arch) opt_groups.os_arch[ info.os.arch ] = 1;
			if (info.cpu.manufacturer) opt_groups.cpu_manufacturer[ info.cpu.manufacturer ] = 1;
			if (info.cpu.brand) opt_groups.cpu_brand[ info.cpu.brand ] = 1;
			if (info.cpu.cores) opt_groups.cpu_cores[ info.cpu.cores ] = 1;
		} );
		
		// sort alpha and convert to id/title for menu opts
		for (var key in opt_groups) {
			opt_groups[key] = Object.keys(opt_groups[key]).sort().map( function(value) { return { id: value.replace(/\W+/g, '').toLowerCase(), title: value }; } );
		}
		
		// must sort cpu_cores numerically
		opt_groups.cpu_cores.sort( function(a, b) {
			return parseInt(a.id) - parseInt(b.id);
		} );
		
		var filter_opts = [
			{ id: '', title: 'All Servers', icon: 'desktop-classic' },
			{ id: 'z_online', title: 'Online Only', icon: 'checkbox-marked-outline' },
		].concat(
			this.buildOptGroup( app.groups, "Server Groups:", 'server-network', 'g_' ),
			this.buildOptGroup( opt_groups.os_platform, "OS Platform:", '', 'osp_' ),
			this.buildOptGroup( opt_groups.os_distro, "OS Distro:", '', 'osd_' ),
			this.buildOptGroup( opt_groups.os_release, "OS Release:", '', 'osr_' ),
			this.buildOptGroup( opt_groups.os_arch, "OS Arch:", '', 'osa_' ),
			this.buildOptGroup( opt_groups.cpu_manufacturer, "CPU Type:", '', 'cput_' ),
			this.buildOptGroup( opt_groups.cpu_brand, "CPU Brand:", '', 'cpub_' ),
			this.buildOptGroup( opt_groups.cpu_cores, "CPU Cores:", '', 'cpuc_' ),
		);
		
		// sort servers by hostname ascending
		this.servers = resp.rows.sort( function(a, b) {
			return a.hostname.localeCompare( b.hostname );
		} );
		
		// NOTE: Don't change these columns without also changing the responsive css column collapse rules in style.css
		var cols = ['Hostname', 'IP Address', 'Group', '# CPUs', 'RAM', 'OS', 'Uptime', '# Jobs', '# Alerts'];
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			// html += '<div class="header_search_widget"><i class="mdi mdi-magnify">&nbsp;</i><input type="text" size="15" placeholder="Search"/></div>';
			
			html += '<div class="box_title_widget" style="overflow:visible; margin-left:0;"><i class="mdi mdi-magnify" onMouseUp="$(\'#fe_es_search\').focus()">&nbsp;</i><input type="text" id="fe_es_search" placeholder="Filter" value="' + encode_attrib_entities(args.search ?? '') + '" onInput="$P().applyTableFilters()"/></div>';
			
			html += '<div class="box_title_widget" style="overflow:visible; min-width:120px; max-width:200px; font-size:13px;">' + this.getFormMenuSingle({
				id: 'fe_es_filter',
				title: 'Filter server list',
				options: filter_opts,
				value: args.filter || '',
				onChange: '$P().applyTableFilters()',
				'data-shrinkwrap': 1
			}) + '</div>';
			
			html += 'Active Servers';
		html += '</div>';
		html += '<div class="box_content table">';
		
		var grid_opts = {
			rows: this.servers,
			cols: cols,
			data_type: 'server',
			below: '<ul class="grid_row_empty" id="ul_es_none_found" style="display:none"><div style="grid-column-start: span ' + cols.length + ';">No servers found matching your filters.</div></ul>'
		};
		
		html += this.getBasicGrid( grid_opts, function(item, idx) {
			var classes = [];
			if (!item.info) item.info = {};
			if (!item.info.os) item.info.os = { distro: 'Unknown', release: '' };
			if (!item.info.cpu) item.info.cpu = {};
			if (!item.info.memory) item.info.memory = {};
			
			var nice_jobs = 'Idle';
			var num_jobs = find_objects( app.activeJobs, { server: item.id } ).length;
			if (num_jobs > 0) nice_jobs = '<i class="mdi mdi-autorenew mdi-spin">&nbsp;</i><b>' + num_jobs + '</b>';
			
			var nice_alerts = 'None';
			var num_alerts = find_objects( app.activeAlerts, { server: item.id } ).length;
			if (num_alerts > 0) nice_alerts = '<i class="mdi mdi-bell-outline">&nbsp;</i><b>' + num_alerts + '</b>';
			
			var tds = [
				'<span style="font-weight:bold">' + self.getNiceServer(item, true) + '</span>',
				item.ip,
				self.getNiceGroup(item.group, true),
				'<i class="mdi mdi-chip">&nbsp;</i>' + (item.info.cpu.cores || 0),
				'<i class="mdi mdi-memory">&nbsp;</i>' + get_text_from_bytes(item.info.memory.total || 0),
				item.info.os.distro + ' ' + item.info.os.release,
				item.info.booted ? get_text_from_seconds( now - item.info.booted, true, true ) : 'n/a',
				'<div id="d_es_server_jobs_' + item.id + '">' + nice_jobs + '</div>',
				nice_alerts
			];
			
			if (item.offline) classes.push('disabled');
			if (num_alerts > 0) classes.push( 'clr_red' );
			if (classes.length) tds.className = classes.join(' ');
			return tds;
		} ); // getBasicGrid
		
		html += '</div>'; // box_content
		
		html += '<div class="box_buttons">';
			html += '<div class="button" onMouseUp="$P().go_server_search()">Search History...</div>';
			html += '<div class="button secondary" onMouseUp="$P().go_add_server()">Add Server...</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		this.applyTableFilters();
		SingleSelect.init( this.div.find('#fe_es_filter') );
	}
	
	go_server_search() {
		Nav.go('#Servers?sub=search');
	}
	
	go_add_server() {
		// TODO: this
	}
	
	applyTableFilters() {
		// filters and/or search query changed -- re-filter table
		var self = this;
		var args = this.args;
		var num_visible = 0;
		
		args.search = $('#fe_es_search').val();
		args.filter = $('#fe_es_filter').val();
		if (!args.search.length) delete args.search;
		if (!args.filter.length) delete args.filter;
		var is_filtered = (('search' in args) || ('filter' in args));
		
		this.div.find('.box_content.table ul.grid_row').each( function(idx) {
			var $this = $(this);
			var row = self.servers[idx];
			
			if (self.isRowVisible(row)) { $this.show(); num_visible++; }
			else $this.hide();
		} );
		
		// if ALL items are hidden due to search/filter, show some kind of message
		if (!num_visible && is_filtered && this.servers.length) this.div.find('#ul_es_none_found').show();
		else this.div.find('#ul_es_none_found').hide();
		
		// do history.replaceState jazz here
		// don't mess up initial visit href
		var query = deep_copy_object(args);
		delete query.sub;
		
		var url = '#Servers' + (num_keys(query) ? compose_query_string(query) : '');
		history.replaceState( null, '', url );
		Nav.loc = url;
		
		// magic trick: replace link in sidebar for Events
		$('#tab_Servers').attr( 'href', url );
	}
	
	isRowVisible(item) {
		// check if row should be filtered using args
		var args = this.args;
		var is_filtered = (('search' in args) || ('filter' in args));
		if (!is_filtered) return true; // show
		
		if (('search' in args) && args.search.length) {
			var words = [item.hostname, item.ip, item.info.os.distro, item.info.os.release].join(' ').toLowerCase();
			if (words.indexOf(args.search.toLowerCase()) == -1) return false; // hide
		}
		
		if (('filter' in args) && args.filter.match && args.filter.match(/^(\w)_(.+)$/)) {
			var mode = RegExp.$1;
			var value = RegExp.$2;
			switch (mode) {
				case 'z':
					if ((value == 'online') && item.offline) return false; // hide
				break;
				
				case 'g':
					if (item.group != value) return false; // hide
				break;
				
				case 'osp_':
					if (item.info.os.platform != value) return false; // hide
				break;
				
				case 'osd_':
					if (item.info.os.distro != value) return false; // hide
				break;
				
				case 'osr_':
					if (item.info.os.release != value) return false; // hide
				break;
				
				case 'osa_':
					if (item.info.os.arch != value) return false; // hide
				break;
				
				case 'cput_':
					if (item.info.cpu.manufacturer != value) return false; // hide
				break;
				
				case 'cpub_':
					if (item.info.cpu.brand != value) return false; // hide
				break;
				
				case 'cpuc_':
					if (item.info.cpu.cores != value) return false; // hide
				break;
			} // switch mode
		}
		
		return true; // show
	}
	
	handleStatusUpdateList(data) {
		// received status update from server
		var self = this;
		
		// only redraw status fields if jobs changed
		if (!data.jobsChanged) return;
		
		this.servers.forEach( function(item, idx) {
			var nice_jobs = 'Idle';
			var num_jobs = find_objects( app.activeJobs, { server: item.id } ).length;
			if (num_jobs > 0) nice_jobs = '<i class="mdi mdi-autorenew mdi-spin">&nbsp;</i><b>' + num_jobs + '</b>';
			
			self.div.find('#d_es_server_jobs_' + item.id).html( nice_jobs );
		} );
	}
	
	// Server Search Page:
	
	gosub_search(args) {
		// search server db
		if (!args.offset) args.offset = 0;
		if (!args.limit) args.limit = 25;
		
		app.setWindowTitle('Server Search');
		app.setHeaderTitle( '<i class="mdi mdi-cloud-search-outline">&nbsp;</i>Server Search' );
		
		this.loading();
		// this.loading();
		
		app.api.get( 'app/get_server_summaries', {}, this.receiveSearchSummaries.bind(this) );
	}
	
	receiveSearchSummaries(resp) {
		// convert summaries to menu items for search box
		var args = this.args;
		
		if (!this.active) return; // sanity
		
		var field_menus = {};
		for (var field_id in resp.summaries) {
			var labels = resp.summaries[field_id].labels;
			field_menus[field_id] = Object.keys(labels).sort().map( function(id) {
				return { id: id, title: labels[id] };
			} );
		}
		
		// resort cpu_cores numerically
		field_menus.cpu_cores.sort( function(a, b) { return parseInt(a.id) - parseInt(b.id); } );
		
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
		
		var html = '';
		html += '<div class="box" style="border:none;">';
		html += '<div class="box_content" style="padding:20px;">';
			
			// search box
			html += '<div class="search_box">';
				html += '<i class="mdi mdi-magnify" onMouseUp="$(\'#fe_ss_query\').focus()">&nbsp;</i>'; // TODO: fix search help url below:
				html += '<div class="search_help"><a href="https://github.com/jhuckaby/orchestra#search" target="_blank">Search Help<i class="mdi mdi-open-in-new"></i></a></div>';
				html += '<input type="text" id="fe_ss_query" maxlength="128" placeholder="Search Keywords..." value="' + escape_text_field_value(args.query || '') + '">';
			html += '</div>';
			
			// options
			html += '<div id="d_ss_adv" class="form_grid" style="margin-bottom:25px">';
				
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
				
				// os_platform -- laptop
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-laptop">&nbsp;</i>OS Platform:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_os_platform',
							title: 'Select Platform',
							placeholder: 'All Platforms',
							options: [['', 'Any Platform']].concat( field_menus.os_platform ),
							value: args.os_platform || '',
							default_icon: 'laptop',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// os_distro -- harddisk
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-harddisk">&nbsp;</i>OS Distribution:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_os_distro',
							title: 'Select Distro',
							placeholder: 'All Distros',
							options: [['', 'Any Distro']].concat( field_menus.os_distro ),
							value: args.os_distro || '',
							default_icon: 'harddisk',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// os_release -- pound
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-pound">&nbsp;</i>OS Release:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_os_release',
							title: 'Select Release',
							placeholder: 'All Releases',
							options: [['', 'Any Release']].concat( field_menus.os_release ),
							value: args.os_release || '',
							default_icon: 'pound',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// os_arch -- archive
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-archive">&nbsp;</i>OS Architecture:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_os_arch',
							title: 'Select Architecture',
							placeholder: 'All Architectures',
							options: [['', 'Any Architecture']].concat( field_menus.os_arch ),
							value: args.os_arch || '',
							default_icon: 'archive',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// cpu_manufacturer -- domain
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-domain">&nbsp;</i>CPU Manufacturer:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_cpu_manufacturer',
							title: 'Select Manufacturer',
							placeholder: 'All Manufacturers',
							options: [['', 'Any Manufacturer']].concat( field_menus.cpu_manufacturer ),
							value: args.cpu_manufacturer || '',
							default_icon: 'domain',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// cpu_brand -- chip
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-chip">&nbsp;</i>CPU Brand:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_cpu_brand',
							title: 'Select Brand',
							placeholder: 'All Brands',
							options: [['', 'Any Brand']].concat( field_menus.cpu_brand ),
							value: args.cpu_brand || '',
							default_icon: 'chip',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// cpu_cores -- cpu-64-bit
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-pound">&nbsp;</i>CPU Cores:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_cpu_cores',
							title: 'Select Cores',
							placeholder: 'All Core Counts',
							options: [['', 'Any Core Count']].concat( field_menus.cpu_cores ),
							value: args.cpu_cores || '',
							default_icon: 'pound',
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// created
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-calendar-multiple">&nbsp;</i>Created:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_created',
							title: 'Date Range',
							options: date_items.map( function(item) { 
								return item[0] ? { id: item[0], title: item[1], icon: 'calendar-range' } : item; 
							} ),
							value: args.created,
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
				// modified
				html += '<div class="form_cell">';
					html += this.getFormRow({
						label: '<i class="icon mdi mdi-calendar-multiple">&nbsp;</i>Last Modified:',
						content: this.getFormMenuSingle({
							id: 'fe_ss_modified',
							title: 'Date Range',
							options: date_items.map( function(item) { 
								return item[0] ? { id: item[0], title: item[1], icon: 'calendar-range' } : item; 
							} ),
							value: args.modified,
							'data-shrinkwrap': 1
						})
					});
				html += '</div>';
				
			html += '</div>'; // form_grid
		
		// buttons at bottom
		html += '<div class="box_buttons" style="padding:0">';
			
			// html += '<div id="btn_s_save" class="button mobile_collapse" onMouseUp="$P().doSavePreset()"><i class="mdi mdi-floppy">&nbsp;</i><span>' + (preset ? 'Edit' : 'Save') + ' Preset...</span></div>';
			// html += '<div class="button" id="btn_s_download" onMouseUp="$P().doDownload()"><i class="mdi mdi-cloud-download-outline">&nbsp;</i>Download All...</div>';
			html += '<div class="button primary" onMouseUp="$P().navSearch()"><i class="mdi mdi-magnify">&nbsp;</i>Search</div>';
			// html += '<div class="clear"></div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box_content
		html += '</div>'; // box
		
		html += '<div id="d_search_results"><div class="loading_container"><div class="loading"></div></div></div>';
		
		this.div.html( html );
		
		var sargs = this.getSearchArgs();
		// if (!sargs) this.div.find('#btn_s_save').addClass('disabled');
		
		// MultiSelect.init( this.div.find('#fe_s_tags') );
		SingleSelect.init( this.div.find('#fe_ss_group, #fe_ss_os_platform, #fe_ss_os_distro, #fe_ss_os_release, #fe_ss_os_arch, #fe_ss_cpu_manufacturer, #fe_ss_cpu_brand, #fe_ss_cpu_cores, #fe_ss_created, #fe_ss_modified') );
		// $('.header_search_widget').hide();
		
		this.div.find('#fe_ss_group, #fe_ss_os_platform, #fe_ss_os_distro, #fe_ss_os_release, #fe_ss_os_arch, #fe_ss_cpu_manufacturer, #fe_ss_cpu_brand, #fe_ss_cpu_cores, #fe_ss_created, #fe_ss_modified').on('change', function() {
			self.navSearch();
		});
		
		$('#fe_ss_query').on('keydown', function(event) {
			// capture enter key
			if (event.keyCode == 13) {
				event.preventDefault();
				self.navSearch();
			}
		});
		
		$('#fe_ss_query').focus();
		this.doSearch();
	}
	
	getSearchArgs() {
		// get form values, return search args object
		var self = this;
		var args = {};
		
		var query = this.div.find('#fe_ss_query').val().trim()
		if (query.length) args.query = query;
		
		['group', 'os_platform', 'os_distro', 'os_release', 'os_arch', 'cpu_manufacturer', 'cpu_brand', 'cpu_cores', 'created', 'modified'].forEach( function(key) {
			var value = self.div.find('#fe_ss_' + key).val();
			if (value) args[key] = value;
		} );
		
		if (!num_keys(args)) return null;
		
		return args;
	}
	
	navSearch() {
		// convert form into query and redirect
		app.clearError();
		
		var args = this.getSearchArgs();
		if (!args) {
			// return app.badField('#fe_ss_query', "Please enter a search query.");
			// args = { query: '*' };
			Nav.go( this.selfNav({}) );
			return;
		}
		
		Nav.go( this.selfNav(args) );
	}
	
	getSearchQuery(args) {
		// construct actual unbase simple query syntax
		var self = this;
		var query = args.query ? args.query.toString().toLowerCase().trim() : '';
		
		['group', 'os_platform', 'os_distro', 'os_release', 'os_arch', 'cpu_manufacturer', 'cpu_brand', 'cpu_cores'].forEach( function(key) {
			if (args[key]) query += ' ' + key + ':' + args[key];
		} );
		
		['created', 'modified'].forEach( function(key) {
			if (!args[key]) return;
			query += ' ' + self.getDateRangeQuery(key, args[key]);
		} ); // dates
		
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
		};
		app.api.get( 'app/search_servers', this.opts, this.receiveResults.bind(this) );
	}
	
	receiveResults(resp) {
		// receive search results
		var self = this;
		var $results = this.div.find('#d_search_results');
		var html = '';
		
		if (!this.active) return; // sanity
		
		// massage the DB search resp so that things are happy
		// resp.rows = resp.records;
		// resp.list = { length: resp.total };
		
		this.lastSearchResp = resp;
		this.servers = [];
		if (resp.rows) this.servers = resp.rows;
		
		var grid_args = {
			resp: resp,
			cols: ['Hostname', 'IP Address', 'Group', '# CPUs', 'RAM', 'OS', 'Created', 'Modified'],
			data_type: 'server',
			offset: this.args.offset || 0,
			limit: this.args.limit,
			class: 'data_grid server_search_grid',
			pagination_link: '$P().searchPaginate'
		};
		
		html += '<div class="box">';
		
		html += '<div class="box_title" style="' + (this.servers.length ? 'padding-bottom:10px' : '') + '">';
			html += this.getSearchArgs() ? 'Search Results' : 'All Servers';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		html += '<div class="box_content table">';
		
		html += this.getPaginatedGrid( grid_args, function(item, idx) {
			return [
				'<b>' + self.getNiceServer(item, true) + '</b>',
				item.ip,
				self.getNiceGroup(item.group, true),
				'<i class="mdi mdi-chip">&nbsp;</i>' + (item.info.cpu.cores || 0),
				'<i class="mdi mdi-memory">&nbsp;</i>' + get_text_from_bytes(item.info.memory.total || 0),
				item.info.os.distro + ' ' + item.info.os.release,
				self.getRelativeDateTime( item.created ),
				self.getRelativeDateTime( item.modified )
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
	
	// TODO: Server View Page:
	
	gosub_view(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		this.args = args;
		
		app.showSidebar(true);
		app.setHeaderTitle( '...' );
		
		this.snapshot = null;
		
		this.loading();
		app.api.get( 'app/get_server', { id: args.id }, this.receive_snapshot.bind(this), this.fullPageError.bind(this) );
		return true;
	}
	
	receive_snapshot(resp) { // TODO: all this here
		// render snapshot details
		var self = this;
		var args = this.args;
		var html = '';
		
		// make sure page is still active (API may be slow)
		if (!this.active) return;
		
		var snapshot = this.snapshot = resp.server;
		if (!snapshot) return this.doFullPageError("Server not found: " + this.args.id);
		
		var server = this.server = app.servers[ snapshot.server ] || null;
		// var is_live = this.live = !!(server && !args.yyyy && !args.mm && !args.dd && !args.hh);
		
		if (!args.yyyy && !server) {
			// quickly switch from real-time to historical mode, as server is offline
			// use date/time from snapshot (last known live timestamp)
			
			// TODO: this
		}
		
		var icon = '<i class="mdi mdi-' + (server ? 'router-network' : 'close-network-outline') + '">&nbsp;</i>';
		
		app.setHeaderTitle( icon + snapshot.hostname );
		app.setWindowTitle( "Viewing Server: " + snapshot.hostname + "" );
		
		html += '<div class="box" style="border:none;">';
			html += '<div class="box_title">';
				html += '<div class="box_title_left">Live - Real-Time View</div>';
				html += '<div class="box_title_left"><div class="button secondary"><i class="mdi mdi-calendar-cursor">&nbsp;</i>Change...</div></div>';
				
				html += '<div class="box_title_right"><div class="button primary"><i class="mdi mdi-monitor-screenshot">&nbsp;</i>Snapshot</div></div>';
				html += '<div class="box_title_right"><div class="button secondary"><i class="mdi mdi-magnify-scan">&nbsp;</i>Watch...</div></div>';
				html += '<div class="box_title_right"><div class="button secondary"><i class="mdi mdi-file-edit-outline">&nbsp;</i>Edit Server...</div></div>';
			html += '</div>';
		html += '</div>';
		
		
		
		this.div.html(html);
		
		// SingleSelect.init( this.div.find('#fe_vs_mode, #fe_vs_year') );
		
		// this.getSnapshotAlerts();
		// this.getSnapshotJobs();
	}
	
	onStatusUpdate(data) {
		// called every 1s from websocket
		switch (this.args.sub) {
			case 'list': this.handleStatusUpdateList(data); break;
		}
	}
	
	onDataUpdate(key, data) {
		// refresh list if servers were updated
		switch (this.args.sub) {
			case 'list':
				if ((key == 'servers') || (key == 'activeAlerts')) this.gosub_list(this.args);
			break;
		}
	}
	
	onDeactivate() {
		// called when page is deactivated
		delete this.servers;
		
		// destroy charts if applicable (view page)
		if (this.charts) {
			for (var key in this.charts) {
				this.charts[key].destroy();
			}
			delete this.charts;
		}
		
		this.div.html( '' );
		return true;
	}
	
};
