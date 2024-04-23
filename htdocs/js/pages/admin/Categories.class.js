// Admin Page -- Category Config

Page.Categories = class Categories extends Page.Base {
	
	onInit() {
		// called once at page load
		this.default_sub = 'list';
		this.dom_prefix = 'ec';
	}
	
	onActivate(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		if (!args.sub) args.sub = this.default_sub;
		this.args = args;
		
		app.showSidebar(true);
		app.setHeaderTitle( '<i class="mdi mdi-folder-multiple-outline">&nbsp;</i>Event Category Setup' );
		
		this.loading();
		this['gosub_'+args.sub](args);
		
		return true;
	}
	
	gosub_list(args) {
		// show category list
		app.setWindowTitle( "Event Categories" );
		
		// this.loading();
		// app.api.post( 'app/get_categories', copy_object(args), this.receive_categories.bind(this) );
		
		// kill drag operation if in progress (i.e. from onDataUpdate)
		this.cancelGridDrag( this.div.find('div.data_grid') );
		
		// use categories in app cache
		this.receive_categories({
			code: 0,
			rows: app.categories,
			list: { length: app.categories.length }
		});
	}
	
	receive_categories(resp) {
		// receive all categories from server, render them sorted
		var self = this;
		var html = '';
		
		if (!resp.rows) resp.rows = [];
		this.categories = resp.rows;
		
		// NOTE: Don't change these columns without also changing the responsive css column collapse rules in style.css
		var cols = ['<i class="mdi mdi-menu"></i>', 'Category Title', 'Category ID', 'Events', 'Author', 'Created', 'Actions'];
		// if (app.isCategoryLimited()) cols.shift();
		
		var drag_handle = app.isCategoryLimited() ? '<div class="td_drag_handle" style="cursor:default"><i class="mdi mdi-menu"></i></div>' : 
			'<div class="td_drag_handle" draggable="true" title="Drag to reorder"><i class="mdi mdi-menu"></i></div>';
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'Event Categories';
		html += '</div>';
		html += '<div class="box_content table">';
		
		html += this.getBasicGrid( this.categories, cols, 'category', function(item, idx) {
			var classes = [], actions = [];
			actions.push( '<span class="link" onMouseUp="$P().edit_category('+idx+')"><b>Edit</b></span>' );
			actions.push( '<span class="link" onMouseUp="$P().delete_category('+idx+')"><b>Delete</b></span>' );
			
			var cat_events = find_objects( app.events, { category: item.id } );
			var num_events = cat_events.length;
			
			var tds = [
				drag_handle,
				'<b>' + self.getNiceCategory(item, true) + '</b>',
				'<span class="mono">' + item.id + '</span>',
				commify( num_events ),
				// commify( item.max_jobs ),
				self.getNiceUser(item.username, app.isAdmin()),
				'<span title="'+self.getNiceDateTimeText(item.created)+'">'+self.getNiceDate(item.created)+'</span>',
				actions.join(' | ')
			];
			// if (app.isCategoryLimited()) tds.shift();
			
			if (!item.enabled) classes.push('disabled');
			if (item.color) classes.push( 'clr_' + item.color );
			if (classes.length) tds.className = classes.join(' ');
			return tds;
		} ); // getBasicTable
		
		html += '</div>'; // box_content
		
		html += '<div class="box_buttons">';
			html += '<div class="button secondary" onMouseUp="$P().edit_category(-1)">Add Category...</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		this.setupBoxButtonFloater();
		
		if (!app.isCategoryLimited()) this.setupDraggableGrid({
			table_sel: this.div.find('div.data_grid'), 
			handle_sel: 'div.td_drag_handle', 
			drag_ghost_sel: 'div:nth-child(2)', 
			drag_ghost_x: 5, 
			drag_ghost_y: 10, 
			callback: this.category_move.bind(this)
		});
	}
	
	category_move($rows) {
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
		app.api.post( 'app/multi_update_category', data, function(resp) {
			// done
		} );
	}
	
	edit_category(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Categories?sub=edit&id=' + this.categories[idx].id );
		else Nav.go( '#Categories?sub=new' );
	}
	
	delete_category(idx) {
		// delete category from search results
		this.category = this.categories[idx];
		this.show_delete_category_dialog();
	}
	
	gosub_new(args) {
		// create new category
		var html = '';
		app.setWindowTitle( "New Category" );
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'New Event Category';
			html += '<div class="box_subtitle"><a href="#Categories?sub=list">&laquo; Back to Category List</a></div>';
		html += '</div>';
		html += '<div class="box_content">';
		
		this.category = {
			id: "",
			title: "",
			notes: "",
			// max_jobs: 0,
			enabled: true,
			color: '',
			limits: [],
			actions: []
		};
		this.limits = this.category.limits; // for res limit editor
		this.actions = this.category.actions; // for job action editor
		
		html += this.get_category_edit_html();
		
		html += '</div>'; // box_content
		
		// buttons at bottom
		html += '<div class="box_buttons">';
			html += '<div class="button" onMouseUp="$P().cancel_category_edit()">Cancel</div>';
			html += '<div class="button primary" onMouseUp="$P().do_new_category()"><i class="mdi mdi-floppy">&nbsp;</i>Create Category</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		
		SingleSelect.init( this.div.find('#fe_ec_color, #fe_ec_icon') );
		// MultiSelect.init( this.div.find('select[multiple]') );
		$('#fe_ec_title').focus();
		this.setupBoxButtonFloater();
	}
	
	cancel_category_edit() {
		// cancel editing category and return to list
		Nav.go( '#Categories?sub=list' );
	}
	
	do_new_category(force) {
		// create new category
		app.clearError();
		var category = this.get_category_form_json();
		if (!category) return; // error
		
		this.category = category;
		
		Dialog.showProgress( 1.0, "Creating Category..." );
		app.api.post( 'app/create_category', category, this.new_category_finish.bind(this) );
	}
	
	new_category_finish(resp) {
		// new category created successfully
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go('Categories?sub=list');
		app.showMessage('success', "The new category was created successfully.");
	}
	
	gosub_edit(args) {
		// edit category subpage
		this.loading();
		app.api.post( 'app/get_category', { id: args.id }, this.receive_category.bind(this), this.fullPageError.bind(this) );
	}
	
	receive_category(resp) {
		// edit existing category
		var html = '';
		if (!this.active) return; // sanity
		
		this.category = resp.category;
		this.limits = this.category.limits; // for res limit editor
		this.actions = this.category.actions; // for job action editor
		
		app.setWindowTitle( "Editing Category \"" + (this.category.title) + "\"" );
		
		html += '<div class="box">';
		html += '<div class="box_title">';
			html += 'Editing Event Category &ldquo;' + (this.category.title) + '&rdquo;';
			html += '<div class="box_subtitle"><a href="#Categories?sub=list">&laquo; Back to Category List</a></div>';
		html += '</div>';
		html += '<div class="box_content">';
		
		html += this.get_category_edit_html();
		
		html += '</div>'; // box_content
		
		// buttons at bottom
		html += '<div class="box_buttons">';
			html += '<div class="button" onMouseUp="$P().cancel_category_edit()">Cancel</div>';
			html += '<div class="button danger" onMouseUp="$P().show_delete_category_dialog()">Delete Category...</div>';
			html += '<div class="button primary" onMouseUp="$P().do_save_category()"><i class="mdi mdi-floppy">&nbsp;</i>Save Changes</div>';
		html += '</div>'; // box_buttons
		
		html += '</div>'; // box
		
		this.div.html( html );
		
		// lock ID for editing
		$('#fe_ec_id').attr('disabled', true);
		SingleSelect.init( this.div.find('#fe_ec_color, #fe_ec_icon') );
		this.setupBoxButtonFloater();
	}
	
	do_save_category() {
		// save changes to category
		app.clearError();
		var category = this.get_category_form_json();
		if (!category) return; // error
		
		this.category = category;
		
		Dialog.showProgress( 1.0, "Saving Category..." );
		app.api.post( 'app/update_category', category, this.save_category_finish.bind(this) );
	}
	
	save_category_finish(resp) {
		// new category saved successfully
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go( 'Categories?sub=list' );
		app.showMessage('success', "The event category was saved successfully.");
	}
	
	show_delete_category_dialog() {
		// show dialog confirming category delete action
		var self = this;
		
		// check for events first
		var cat_events = find_objects( app.events, { category: this.category.id } );
		var num_events = cat_events.length;
		if (num_events) return app.doError("Sorry, you cannot delete a category that has events assigned to it.");
		
		Dialog.confirmDanger( 'Delete Category', "Are you sure you want to <b>permanently delete</b> the event category &ldquo;" + this.category.title + "&rdquo;?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				Dialog.showProgress( 1.0, "Deleting Category..." );
				app.api.post( 'app/delete_category', self.category, self.delete_category_finish.bind(self) );
			}
		} );
	}
	
	delete_category_finish(resp) {
		// finished deleting category
		var self = this;
		Dialog.hideProgress();
		if (!this.active) return; // sanity
		
		Nav.go('Categories?sub=list', 'force');
		app.showMessage('success', "The event category &ldquo;" + this.category.title + "&rdquo; was deleted successfully.");
	}
	
	get_category_edit_html() {
		// get html for editing an category (or creating a new one)
		var html = '';
		var category = this.category;
		
		// title
		html += this.getFormRow({
			label: 'Category Title:',
			content: this.getFormText({
				id: 'fe_ec_title',
				spellcheck: 'false',
				value: category.title,
				onChange: '$P().suggestIDFromTitle()'
			}),
			caption: 'Enter the title of the category, for display purposes.'
		});
		
		// category id
		html += this.getFormRow({
			label: 'Category ID:',
			content: this.getFormText({
				id: 'fe_ec_id',
				class: 'monospace',
				spellcheck: 'false',
				onChange: '$P().checkCategoryExists(this)',
				value: category.id
			}),
			suffix: '<div class="checker"></div>',
			caption: 'Enter a unique ID for the category (alphanumerics only).  Once created this cannot be changed.'
		});
		
		// enabled
		html += this.getFormRow({
			label: 'Status:',
			content: this.getFormCheckbox({
				id: 'fe_ec_enabled',
				label: 'Category Enabled',
				checked: category.enabled
			}),
			caption: 'Check this box to enable jobs to run in the category.'
		});
		
		// icon
		html += this.getFormRow({
			label: 'Custom Icon:',
			content: this.getFormMenuSingle({
				id: 'fe_ec_icon',
				title: 'Select icon for category',
				placeholder: 'Select icon for category...',
				options: [['', '(None)']].concat( iconFontNames.map( function(name) { return { id: name, title: name, icon: name }; } ) ),
				value: category.icon || '',
				// 'data-shrinkwrap': 1
			}),
			caption: 'Optionally choose an icon for the category.'
		});
		
		// color
		var color_items = [
			{
				id: 'plain',
				title: 'Plain',
				class: 'clr_plain'
			},
			{
				id: 'red',
				title: 'Red',
				class: 'clr_red'
			},
			{
				id: 'green',
				title: 'Green',
				class: 'clr_green'
			},
			{
				id: 'blue',
				title: 'Blue',
				class: 'clr_blue'
			},
			{
				id: 'skyblue',
				title: 'Sky Blue',
				class: 'clr_skyblue'
			},
			{
				id: 'yellow',
				title: 'Yellow',
				class: 'clr_yellow'
			},
			{
				id: 'purple',
				title: 'Purple',
				class: 'clr_purple'
			},
			{
				id: 'orange',
				title: 'Orange',
				class: 'clr_orange'
			}
		];
		html += this.getFormRow({
			label: 'Highlight Color:',
			content: this.getFormMenuSingle({
				id: 'fe_ec_color',
				title: "Select Highlight Color",
				options: color_items,
				value: category.color
			}),
			caption: 'Optionally select a highlight color for the category, which will show on the schedule.'
		});
		
		// actions
		// (requires this.actions to be populated)
		html += this.getFormRow({
			label: 'Job Actions:',
			content: '<div id="d_ec_jobact_table">' + this.getJobActionTable() + '</div>',
			caption: 'Optionally select custom actions to perform for all jobs in this category.  Events can include more actions.'
		});
		
		// default resource limits
		// (requires this.limits to be populated)
		html += this.getFormRow({
			label: 'Resource Limits:',
			content: '<div id="d_ec_reslim_table">' + this.getResLimitTable() + '</div>',
			caption: 'Optionally select default resource limits for jobs in this category.  These can be overridden at the event level.'
		});
		
		// notes
		html += this.getFormRow({
			label: 'Notes:',
			content: this.getFormTextarea({
				id: 'fe_ec_notes',
				rows: 5,
				value: category.notes
			}),
			caption: 'Optionally enter any notes for the category, for your own use.'
		});
		
		return html;
	}
	
	get_category_form_json() {
		// get api key elements from form, used for new or edit
		var category = this.category;
		
		category.id = $('#fe_ec_id').val().replace(/\W+/g, '').toLowerCase();
		category.title = $('#fe_ec_title').val().trim();
		category.enabled = !!$('#fe_ec_enabled').is(':checked');
		category.icon = $('#fe_ec_icon').val();
		category.color = $('#fe_ec_color').val();
		// category.max_jobs = parseInt( $('#fe_ec_max_jobs').val() );
		// category.hostname_match = $('#fe_ec_match').val();
		category.notes = $('#fe_ec_notes').val();
		
		if (!category.id.length) {
			return app.badField('#fe_ec_id', "Please enter a unique alphanumeric ID for the category.");
		}
		if (!category.title.length) {
			return app.badField('#fe_ec_title', "Please enter a title for the category.");
		}
		
		return category;
	}
	
	checkCategoryExists(field) {
		// check if category exists, update UI checkbox
		// called after field changes
		var $field = $(field);
		var id = trim( $field.val().toLowerCase() );
		var $elem = $field.closest('.form_row').find('.fr_suffix .checker');
		
		if (id.match(/^\w+$/)) {
			// check with cache
			if (find_object(app.categories, { id: id })) {
				// category taken
				$elem.css('color','red').html('<span class="mdi mdi-alert-circle"></span>').attr('title', "Category ID is taken.");
				$field.addClass('warning');
			}
			else {
				// category is valid and available!
				$elem.css('color','green').html('<span class="mdi mdi-check-circle"></span>').attr('title', "Category ID is available!");
				$field.removeClass('warning');
			}
		}
		else if (id.length) {
			// bad id
			$elem.css('color','red').html('<span class="mdi mdi-alert-decagram"></span>').attr('title', "Category ID is malformed.");
			$field.addClass('warning');
		}
		else {
			// empty
			$elem.html('').removeAttr('title');
			$field.removeClass('warning');
		}
	}
	
	onDataUpdate(key, data) {
		// refresh list if categories were updated
		if ((key == 'categories') && (this.args.sub == 'list')) this.gosub_list(this.args);
	}
	
	onDeactivate() {
		// called when page is deactivated
		this.div.html( '' );
		return true;
	}
	
};
