// Admin Page -- Group Config

Page.Groups = class Groups extends Page.Base {
	
	onInit() {
		// called once at page load
		this.default_sub = 'list';
		this.dom_prefix = 'eg';
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
		// show group list
		app.setWindowTitle( "Server Groups" );
		app.setHeaderTitle( '<i class="mdi mdi-lan">&nbsp;</i>Server Groups' );
		
		// this.loading();
		// app.api.post( 'app/get_groups', copy_object(args), this.receive_groups.bind(this) );
		
		// kill drag operation if in progress (i.e. from onDataUpdate)
		this.cancelGridDrag( this.div.find('div.data_grid') );
		
		// use groups in app cache
		this.receive_groups({
			code: 0,
			rows: app.groups,
			list: { length: app.groups.length }
		});
	}
	
	receive_groups(resp) {
		// receive all groups from server, render them sorted
		var self = this;
		var html = '';
		
		if (!resp.rows) resp.rows = [];
		this.groups = resp.rows;
		
		// NOTE: Don't change these columns without also changing the responsive css column collapse rules in style.css
		var cols = ['<i class="mdi mdi-menu"></i>', 'Group Title', 'Group ID', 'Hostname Pattern', 'Author', 'Created', 'Actions'];
		// if (app.isGroupLimited()) cols.shift();
		
		var drag_handle = app.isGroupLimited() ? '<div class="td_drag_handle" style="cursor:default"><i class="mdi mdi-menu"></i></div>' : 
			'<div class="td_drag_handle" draggable="true" title="Drag to reorder"><i class="mdi mdi-menu"></i></div>';
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'Server Groups';
		html += '</div>';
		html += '<div class="box_content table">';
		
		html += this.getBasicGrid( this.groups, cols, 'group', function(item, idx) {
			var actions = [];
			actions.push( '<span class="link" onMouseUp="$P().edit_group('+idx+')"><b>Edit</b></span>' );
			actions.push( '<span class="link danger" onMouseUp="$P().delete_group('+idx+')"><b>Delete</b></span>' );
			
			var nice_match = '';
			if (item.hostname_match == '(?!)') nice_match = '(None)';
			else nice_match = '<span class="regexp">/' + item.hostname_match + '/</span>';
			
			var tds = [
				drag_handle,
				'<b>' + self.getNiceGroup(item, true) + '</b>',
				'<span class="mono">' + item.id + '</span>',
				nice_match,
				self.getNiceUser(item.username, app.isAdmin()),
				'<span title="'+self.getNiceDateTimeText(item.created)+'">'+self.getNiceDate(item.created)+'</span>',
				actions.join(' | ')
			];
			// if (app.isGroupLimited()) tds.shift();
			
			return tds;
		} ); // getBasicGrid
		
		html += '</div>'; // box_content
		
		html += '<div class="box_buttons">';
			html += '<div class="button secondary" onMouseUp="$P().edit_group(-1)">Add Group...</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		this.setupBoxButtonFloater();
		
		if (!app.isGroupLimited()) this.setupDraggableGrid({
			table_sel: this.div.find('div.data_grid'), 
			handle_sel: 'div.td_drag_handle', 
			drag_ghost_sel: 'div:nth-child(2)', 
			drag_ghost_x: 5, 
			drag_ghost_y: 10, 
			callback: this.group_move.bind(this)
		});
	}
	
	group_move($rows) {
		// a drag operation has been completed
		var items = [];
		
		$rows.each( function(idx) {
			var $row = $(this);
			items.push({
				id: $row.data('id'),
				sort_order: idx
			});
		});
		
		var data = {
			items: items
		};
		app.api.post( 'app/multi_update_group', data, function(resp) {
			// done
		} );
	}
	
	edit_group(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Groups?sub=edit&id=' + this.groups[idx].id );
		else Nav.go( '#Groups?sub=new' );
	}
	
	delete_group(idx) {
		// delete group from search results
		this.group = this.groups[idx];
		this.show_delete_group_dialog();
	}
	
	gosub_new(args) {
		// create new group
		var html = '';
		app.setWindowTitle( "New Group" );
		
		app.setHeaderNav([
			{ icon: 'lan', loc: '#Groups?sub=list', title: 'Server Groups' },
			{ icon: 'server-network', title: "New Group" }
		]);
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'New Server Group';
			html += '<div class="box_subtitle"><a href="#Groups?sub=list">&laquo; Back to Group List</a></div>';
		html += '</div>';
		html += '<div class="box_content">';
		
		this.group = {
			id: "",
			title: "",
			hostname_match: "",
			mute_alerts: false
		};
		
		html += this.get_group_edit_html();
		
		html += '</div>'; // box_content
		
		// buttons at bottom
		html += '<div class="box_buttons">';
			html += '<div class="button" onMouseUp="$P().cancel_group_edit()">Cancel</div>';
			html += '<div class="button primary" onMouseUp="$P().do_new_group()"><i class="mdi mdi-floppy">&nbsp;</i>Create Group</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		
		SingleSelect.init( this.div.find('#fe_eg_icon, #fe_eg_web_hook') );
		$('#fe_eg_title').focus();
		this.setupBoxButtonFloater();
	}
	
	cancel_group_edit() {
		// cancel editing group and return to list
		Nav.go( '#Groups?sub=list' );
	}
	
	do_new_group(force) {
		// create new group
		app.clearError();
		var group = this.get_group_form_json();
		if (!group) return; // error
		
		this.group = group;
		
		Dialog.showProgress( 1.0, "Creating Group..." );
		app.api.post( 'app/create_group', group, this.new_group_finish.bind(this) );
	}
	
	new_group_finish(resp) {
		// new group created successfully
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go('Groups?sub=list');
		app.showMessage('success', "The new group was created successfully.");
	}
	
	gosub_edit(args) {
		// edit group subpage
		this.loading();
		app.api.post( 'app/get_group', { id: args.id }, this.receive_group.bind(this), this.fullPageError.bind(this) );
	}
	
	receive_group(resp) {
		// edit existing group
		var html = '';
		this.group = resp.group;
		if (!this.active) return; // sanity
		
		app.setWindowTitle( "Editing Group \"" + (this.group.title) + "\"" );
		
		app.setHeaderNav([
			{ icon: 'lan', loc: '#Groups?sub=list', title: 'Server Groups' },
			{ icon: this.group.icon || 'server-network', title: this.group.title }
		]);
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'Edit Server Group Details';
			html += '<div class="box_subtitle"><a href="#Groups?sub=list">&laquo; Back to Group List</a></div>';
		html += '</div>';
		html += '<div class="box_content">';
		
		html += this.get_group_edit_html();
		
		html += '</div>'; // box_content
		
		// buttons at bottom
		html += '<div class="box_buttons">';
			html += '<div class="button" onMouseUp="$P().cancel_group_edit()">Cancel</div>';
			html += '<div class="button danger" onMouseUp="$P().show_delete_group_dialog()">Delete Group...</div>';
			html += '<div class="button primary" onMouseUp="$P().do_save_group()"><i class="mdi mdi-floppy">&nbsp;</i>Save Changes</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		
		// lock ID for editing
		$('#fe_eg_id').attr('disabled', true);
		SingleSelect.init( this.div.find('#fe_eg_icon, #fe_eg_web_hook') );
		this.setupBoxButtonFloater();
	}
	
	do_save_group() {
		// save changes to group
		app.clearError();
		var group = this.get_group_form_json();
		if (!group) return; // error
		
		this.group = group;
		
		Dialog.showProgress( 1.0, "Saving Group..." );
		app.api.post( 'app/update_group', group, this.save_group_finish.bind(this) );
	}
	
	save_group_finish(resp) {
		// new group saved successfully
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go( 'Groups?sub=list' );
		app.showMessage('success', "The server group was saved successfully.");
	}
	
	show_delete_group_dialog() {
		// show dialog confirming group delete action
		var self = this;
		
		Dialog.confirmDanger( 'Delete Group', "Are you sure you want to <b>permanently delete</b> the server group &ldquo;" + this.group.title + "&rdquo;?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				Dialog.showProgress( 1.0, "Deleting Group..." );
				app.api.post( 'app/delete_group', self.group, self.delete_group_finish.bind(self) );
			}
		} );
	}
	
	delete_group_finish(resp) {
		// finished deleting group
		var self = this;
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go('Groups?sub=list', 'force');
		app.showMessage('success', "The server group &ldquo;" + this.group.title + "&rdquo; was deleted successfully.");
	}
	
	get_group_edit_html() {
		// get html for editing an group (or creating a new one)
		var html = '';
		var group = this.group;
		
		// title
		html += this.getFormRow({
			label: 'Group Title:',
			content: this.getFormText({
				id: 'fe_eg_title',
				spellcheck: 'false',
				value: group.title,
				onChange: '$P().suggestIDFromTitle()'
			}),
			caption: 'Enter the title of the group, for display purposes.'
		});
		
		// group id
		html += this.getFormRow({
			label: 'Group ID:',
			content: this.getFormText({
				id: 'fe_eg_id',
				class: 'monospace',
				spellcheck: 'false',
				onChange: '$P().checkGroupExists(this)',
				value: group.id
			}),
			suffix: '<div class="checker"></div>',
			caption: 'Enter a unique ID for the group (alphanumerics only).  Once created this cannot be changed.'
		});
		
		// icon
		html += this.getFormRow({
			label: 'Custom Icon:',
			content: this.getFormMenuSingle({
				id: 'fe_eg_icon',
				title: 'Select icon for group',
				placeholder: 'Select icon for group...',
				options: [['', '(None)']].concat( iconFontNames.map( function(name) { return { id: name, title: name, icon: name }; } ) ),
				value: group.icon || '',
				// 'data-shrinkwrap': 1
			}),
			caption: 'Optionally choose an icon for the group.'
		});
		
		// hostname_match
		html += this.getFormRow({
			label: 'Hostname Match:',
			content: this.getFormText({
				id: 'fe_eg_match',
				class: 'regexp',
				// style: 'font-family:monospace',
				spellcheck: 'false',
				value: (group.hostname_match == '(?!)') ? "" : group.hostname_match
			}),
			caption: 'Optionally enter a regular expression match to auto-include hostnames in the group.<br/>To match <b>all servers</b>, set this to <code>.+</code>'
		});
		
		// alert emails
		html += this.getFormRow({
			label: 'Alert Email:',
			content: this.getFormText({
				id: 'fe_eg_alert_email',
				// type: 'email',
				spellcheck: 'false',
				placeholder: 'email@sample.com',
				value: group.alert_email || '',
				onChange: '$P().updateAddRemoveMe(this)'
			}),
			suffix: '<div class="form_suffix_icon mdi" title="" onMouseUp="$P().addRemoveMe(this)"></div>',
			caption: 'Optionally set the default e-mail recipients to be notified for alerts in this group. Note that individual alerts can override this setting.'
		});
		
		// alert web hook
		html += this.getFormRow({
			label: 'Alert Web Hook:',
			content: this.getFormMenuSingle({
				id: 'fe_eg_web_hook',
				title: 'Select Web Hook',
				options: [ ['', "(None)"] ].concat( app.web_hooks ),
				value: group.web_hook,
				default_icon: 'webhook'
			}),
			caption: 'Optionally set the default Web Hook for alerts in this group. Note that individual alerts can override this setting.'
		});
		
		// mute_alerts
		html += this.getFormRow({
			label: 'Mute:',
			content: this.getFormCheckbox({
				id: 'fe_eg_mute',
				label: 'Mute Alerts',
				checked: group.mute_alerts
			}),
			caption: 'Check this box to silence all monitoring alerts for servers in the group.'
		});
		
		// notes
		html += this.getFormRow({
			label: 'Notes:',
			content: this.getFormTextarea({
				id: 'fe_eg_notes',
				rows: 5,
				value: group.notes
			}),
			caption: 'Optionally enter any notes for the group, for your own use.'
		});
		
		return html;
	}
	
	get_group_form_json() {
		// get api key elements from form, used for new or edit
		var group = this.group;
		
		group.id = $('#fe_eg_id').val().replace(/\W+/g, '').toLowerCase();
		group.title = $('#fe_eg_title').val().trim();
		group.icon = $('#fe_eg_icon').val();
		group.hostname_match = $('#fe_eg_match').val();
		group.alert_email = $('#fe_eg_alert_email').val();
		group.alert_web_hook = $('#fe_eg_web_hook').val();
		group.mute_alerts = !!$('#fe_eg_mute').is(':checked');
		group.notes = $('#fe_eg_notes').val();
		
		if (!group.id.length) {
			return app.badField('#fe_eg_id', "Please enter a unique alphanumeric ID for the group.");
		}
		if (!group.title.length) {
			return app.badField('#fe_eg_title', "Please enter a title for the group.");
		}
		if (!group.hostname_match) {
			// default to never-match regexp
			group.hostname_match = '(?!)';
		}
		
		// test regexp, as it was entered by a user
		try { new RegExp(group.hostname_match); }
		catch(err) {
			return app.badField('fe_eg_match', "Invalid regular expression: " + err);
		}
		
		return group;
	}
	
	checkGroupExists(field) {
		// check if group exists, update UI checkbox
		// called after field changes
		var $field = $(field);
		var id = trim( $field.val().toLowerCase() );
		var $elem = $field.closest('.form_row').find('.fr_suffix .checker');
		
		if (id.match(/^\w+$/)) {
			// check with cache
			if (find_object(app.groups, { id: id })) {
				// group taken
				$elem.css('color','red').html('<span class="mdi mdi-alert-circle"></span>').attr('title', "Group ID is taken.");
				$field.addClass('warning');
			}
			else {
				// group is valid and available!
				$elem.css('color','green').html('<span class="mdi mdi-check-circle"></span>').attr('title', "Group ID is available!");
				$field.removeClass('warning');
			}
		}
		else if (id.length) {
			// bad id
			$elem.css('color','red').html('<span class="mdi mdi-alert-decagram"></span>').attr('title', "Group ID is malformed.");
			$field.addClass('warning');
		}
		else {
			// empty
			$elem.html('').removeAttr('title');
			$field.removeClass('warning');
		}
	}
	
	onDataUpdate(key, data) {
		// refresh list if groups were updated
		if ((key == 'groups') && (this.args.sub == 'list')) this.gosub_list(this.args);
	}
	
	onDeactivate() {
		// called when page is deactivated
		this.div.html( '' );
		return true;
	}
	
};
