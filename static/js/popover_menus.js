/* Module for popovers that have been ported to the modern
   TippyJS/Popper popover library from the legacy Bootstrap
   popovers system in popovers.js. */

import ClipboardJS from "clipboard";
import $ from "jquery";
import tippy, {delegate} from "tippy.js";

import render_actions_popover_content from "../templates/actions_popover_content.hbs";
import render_compose_control_buttons_popover from "../templates/compose_control_buttons_popover.hbs";
import render_compose_select_enter_behaviour_popover from "../templates/compose_select_enter_behaviour_popover.hbs";
import render_left_sidebar_stream_setting_popover from "../templates/left_sidebar_stream_setting_popover.hbs";
import render_mobile_message_buttons_popover_content from "../templates/mobile_message_buttons_popover_content.hbs";

import * as channel from "./channel";
import * as common from "./common";
import * as compose_actions from "./compose_actions";
import * as condense from "./condense";
import * as emoji_picker from "./emoji_picker";
import * as giphy from "./giphy";
import {$t} from "./i18n";
import * as message_edit from "./message_edit";
import * as message_edit_history from "./message_edit_history";
import * as message_lists from "./message_lists";
import * as narrow_state from "./narrow_state";
import * as popover_menus_data from "./popover_menus_data";
import * as popovers from "./popovers";
import * as read_receipts from "./read_receipts";
import * as rows from "./rows";
import * as settings_data from "./settings_data";
import * as stream_popover from "./stream_popover";
import {parse_html} from "./ui_util";
import * as unread_ops from "./unread_ops";
import {user_settings} from "./user_settings";

let left_sidebar_stream_setting_popover_displayed = false;
let compose_mobile_button_popover_displayed = false;
export let compose_enter_sends_popover_displayed = false;
let compose_control_buttons_popover_instance;
let message_actions_popover_displayed = false;

export function actions_popped() {
    return message_actions_popover_displayed;
}

export function get_compose_control_buttons_popover() {
    return compose_control_buttons_popover_instance;
}

const default_popover_props = {
    delay: 0,
    appendTo: () => document.body,
    trigger: "click",
    interactive: true,
    hideOnClick: true,
    /* The light-border TippyJS theme is a bit of a misnomer; it
       is a popover styling similar to Bootstrap.  We've also customized
       its CSS to support Zulip's dark theme. */
    theme: "light-border",
    touch: true,
    /* Don't use allow-HTML here since it is unsafe. Instead, use `parse_html`
       to generate the required html */
};

export function any_active() {
    return (
        left_sidebar_stream_setting_popover_displayed ||
        compose_mobile_button_popover_displayed ||
        compose_control_buttons_popover_instance ||
        compose_enter_sends_popover_displayed ||
        message_actions_popover_displayed
    );
}

function on_show_prep(instance) {
    $(instance.popper).one("click", instance.hide);
    popovers.hide_all_except_sidebars(instance);
}

function tippy_no_propagation(target, popover_props) {
    // Everything we do here can be implemented just using `delegate` like we do for
    // `.compose_mobile_button` popover except `stopPropagation`.
    // So, only use it when you want clicks on the target element to not propagate
    // throughout the app.
    $("body").on("click", target, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const instance = e.currentTarget._tippy;
        if (instance) {
            instance.hide();
            // It is important to destroy popover for this
            // toggle mechanism to work flawlessly and it has to be
            // called inside instance.onHidden since tippy popovers
            // are hidden on document clicks on their own which we don't
            // control explicitly.
            return;
        }
        tippy(e.currentTarget, {
            ...default_popover_props,
            showOnCreate: true,
            ...popover_props,
        });
    });
}

export function initialize() {
    tippy_no_propagation("#streams_inline_icon", {
        onShow(instance) {
            const can_create_streams =
                settings_data.user_can_create_private_streams() ||
                settings_data.user_can_create_public_streams() ||
                settings_data.user_can_create_web_public_streams();
            on_show_prep(instance);

            if (!can_create_streams) {
                // If the user can't create streams, we directly
                // navigate them to the Manage streams subscribe UI.
                window.location.assign("#streams/all");
                // Returning false from an onShow handler cancels the show.
                return false;
            }

            instance.setContent(parse_html(render_left_sidebar_stream_setting_popover()));
            left_sidebar_stream_setting_popover_displayed = true;
            return true;
        },
        onHidden(instance) {
            instance.destroy();
            left_sidebar_stream_setting_popover_displayed = false;
        },
    });

    // compose box buttons popover shown on mobile widths.
    // We want this click event to propagate and hide other popovers
    // that could possibly obstruct user from using this popover.
    delegate("body", {
        ...default_popover_props,
        target: ".compose_mobile_button",
        placement: "top",
        onShow(instance) {
            on_show_prep(instance);
            instance.setContent(
                parse_html(
                    render_mobile_message_buttons_popover_content({
                        is_in_private_narrow: narrow_state.narrowed_to_pms(),
                    }),
                ),
            );
            compose_mobile_button_popover_displayed = true;

            const $popper = $(instance.popper);
            $popper.one("click", ".compose_mobile_stream_button", () => {
                compose_actions.start("stream", {trigger: "new topic button"});
            });
            $popper.one("click", ".compose_mobile_private_button", () => {
                compose_actions.start("private");
            });
        },
        onHidden(instance) {
            // Destroy instance so that event handlers
            // are destroyed too.
            instance.destroy();
            compose_mobile_button_popover_displayed = false;
        },
    });

    // We need to hide instance manually for popover due to
    // `$("body").on("click"...` method not being triggered for
    // the elements when we do:
    // `$(instance.popper).one("click", instance.hide); in onShow.
    // Cannot reproduce it on codepen -
    // https://codepen.io/amanagr/pen/jOLoKVg
    // So, probably a bug on our side.
    tippy_no_propagation(".compose_control_menu_wrapper", {
        placement: "top",
        onShow(instance) {
            instance.setContent(
                parse_html(
                    render_compose_control_buttons_popover({
                        giphy_enabled: giphy.is_giphy_enabled(),
                    }),
                ),
            );
            compose_control_buttons_popover_instance = instance;
            popovers.hide_all_except_sidebars(instance);
        },
        onHidden(instance) {
            instance.destroy();
            compose_control_buttons_popover_instance = undefined;
        },
    });

    tippy_no_propagation(".enter_sends", {
        placement: "top",
        onShow(instance) {
            on_show_prep(instance);
            instance.setContent(
                parse_html(
                    render_compose_select_enter_behaviour_popover({
                        enter_sends_true: user_settings.enter_sends,
                    }),
                ),
            );
            compose_enter_sends_popover_displayed = true;
        },
        onMount(instance) {
            common.adjust_mac_shortcuts(".enter_sends_choices kbd");

            $(instance.popper).one("click", ".enter_sends_choice", (e) => {
                let selected_behaviour = $(e.currentTarget)
                    .find("input[type='radio']")
                    .attr("value");
                selected_behaviour = selected_behaviour === "true"; // Convert to bool
                user_settings.enter_sends = selected_behaviour;
                $(`.enter_sends_${!selected_behaviour}`).hide();
                $(`.enter_sends_${selected_behaviour}`).show();

                // Refocus in the content box so you can continue typing or
                // press Enter to send.
                $("#compose-textarea").trigger("focus");

                return channel.patch({
                    url: "/json/settings",
                    data: {enter_sends: selected_behaviour},
                });
            });
        },
        onHidden(instance) {
            instance.destroy();
            compose_enter_sends_popover_displayed = false;
        },
    });

    tippy_no_propagation(".actions_hover .zulip-icon-ellipsis-v-solid", {
        // The is our minimum supported width for mobile. We shouldn't
        // make the popover wider than this.
        maxWidth: "320px",
        placement: "bottom",
        popperOptions: {
            modifiers: [
                {
                    // The placement is set to bottom, but if that placement does not fit,
                    // the opposite top placement will be used.
                    name: "flip",
                    options: {
                        fallbackPlacements: ["top"],
                    },
                },
            ],
        },
        onShow(instance) {
            on_show_prep(instance);
            const $row = $(instance.reference).closest(".message_row");
            const message_id = rows.id($row);
            const args = popover_menus_data.get_actions_popover_content_context(message_id);
            instance.setContent(parse_html(render_actions_popover_content(args)));
            $row.addClass("has_popover has_actions_popover");
            message_actions_popover_displayed = true;
        },
        onMount(instance) {
            // We want click events to propagate to `instance` so that
            // instance.hide gets called.
            const $popper = $(instance.popper);
            $popper.one("click", ".respond_button", (e) => {
                // Arguably, we should fetch the message ID to respond to from
                // e.target, but that should always be the current selected
                // message in the current message list (and
                // compose_actions.respond_to_message doesn't take a message
                // argument).
                compose_actions.quote_and_reply({trigger: "popover respond"});
                e.preventDefault();
            });

            $popper.one("click", ".popover_edit_message, .popover_view_source", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                message_edit.start($row);
                e.preventDefault();
            });

            $popper.one("click", ".popover_move_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const message = message_lists.current.get(message_id);
                stream_popover.build_move_topic_to_stream_popover(
                    message.stream_id,
                    message.topic,
                    message,
                );
                e.preventDefault();
            });

            $popper.one("click", ".mark_as_unread", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                unread_ops.mark_as_unread_from_here(message_id);
                e.preventDefault();
            });

            $popper.one("click", ".popover_toggle_collapse", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                const message = message_lists.current.get(rows.id($row));
                if ($row) {
                    if (message.collapsed) {
                        condense.uncollapse($row);
                    } else {
                        condense.collapse($row);
                    }
                }
                e.preventDefault();
            });

            $popper.one("click", ".rehide_muted_user_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                const message = message_lists.current.get(rows.id($row));
                const message_container = message_lists.current.view.message_containers.get(
                    message.id,
                );
                if ($row && !message_container.is_hidden) {
                    message_lists.current.view.hide_revealed_message(message_id);
                }
                e.preventDefault();
            });

            $popper.one("click", ".view_edit_history", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                const $row = message_lists.current.get_row(message_id);
                const message = message_lists.current.get(rows.id($row));
                message_edit_history.show_history(message);
                $("#message-history-cancel").trigger("focus");
                e.preventDefault();
            });

            $popper.one("click", ".view_read_receipts", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                read_receipts.show_user_list(message_id);
                e.preventDefault();
            });

            $popper.one("click", ".delete_message", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                message_edit.delete_message(message_id);
                e.preventDefault();
            });

            $popper.one("click", ".reaction_button", (e) => {
                const message_id = $(e.currentTarget).data("message-id");
                // Don't propagate the click event since `toggle_emoji_popover` opens a
                // emoji_picker which we don't want to hide after actions popover is hidden.
                e.stopPropagation();
                e.preventDefault();
                // HACK: Because we need the popover to be based off an
                // element that definitely exists in the page even if the
                // message wasn't sent by us and thus the .reaction_hover
                // element is not present, we use the message's
                // .fa-chevron-down element as the base for the popover.
                const elem = $(".selected_message .actions_hover")[0];
                emoji_picker.toggle_emoji_popover(elem, message_id, true);
            });

            new ClipboardJS($popper.find(".copy_link")[0]).on("success", (e) => {
                // e.trigger returns the DOM element triggering the copy action
                const message_id = e.trigger.dataset.messageId;
                const $row = $(`[zid='${CSS.escape(message_id)}']`);
                $row.find(".alert-msg")
                    .text($t({defaultMessage: "Copied!"}))
                    .css("display", "block")
                    .delay(1000)
                    .fadeOut(300);

                setTimeout(() => {
                    // The Clipboard library works by focusing to a hidden textarea.
                    // We unfocus this so keyboard shortcuts, etc., will work again.
                    $(":focus").trigger("blur");
                }, 0);
            });
        },
        onHidden(instance) {
            const $row = $(instance.reference).closest(".message_row");
            $row.removeClass("has_popover has_actions_popover");
            instance.destroy();
            message_actions_popover_displayed = false;
        },
    });
}
