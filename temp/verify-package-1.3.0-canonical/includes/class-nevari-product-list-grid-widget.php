<?php

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Controls_Manager;

final class Nevari_Product_List_Grid_Widget extends Nevari_Products_Widget {
    public function get_name() {
        return 'nevari-product-list-grid';
    }

    public function get_title() {
        return __('Product List Grid', 'woocommerce');
    }

    public function get_icon() {
        return 'eicon-post-list';
    }

    public function get_style_depends() {
        return array('nevari-products-widget', 'nevari-product-list-grid-widget');
    }

    protected function register_controls() {
        parent::register_controls();

        $this->start_controls_section(
            'section_list_grid_display',
            array(
                'label' => __('List Grid', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_CONTENT,
            )
        );

        $this->add_control(
            'show_button',
            array(
                'label'        => __('Show Button', 'woocommerce'),
                'type'         => Controls_Manager::SWITCHER,
                'label_on'     => __('Yes', 'woocommerce'),
                'label_off'    => __('No', 'woocommerce'),
                'return_value' => 'yes',
                'default'      => '',
            )
        );

        $this->end_controls_section();
    }

    protected function render() {
        if (!function_exists('WC') || !WC()) {
            return;
        }

        $settings = $this->get_settings_for_display();
        $query    = $this->get_products_query($settings);

        if (!$query || !$query->have_posts()) {
            echo '<div class="nevari-product-list-grid-widget"><p>' . esc_html__('No products found.', 'woocommerce') . '</p></div>';
            return;
        }

        $pagination_mode = isset($settings['pagination']) ? $settings['pagination'] : 'numbers';
        $alignment       = isset($settings['pagination_alignment']) ? $settings['pagination_alignment'] : 'center';
        $show_button     = !empty($settings['show_button']);
        $button_label    = !empty($settings['button_text']) ? $settings['button_text'] : __('Select Options', 'woocommerce');
        $button_icon     = isset($settings['button_icon_type']) ? $settings['button_icon_type'] : 'bag';
        $button_icon_url = !empty($settings['button_custom_icon']['url']) ? $settings['button_custom_icon']['url'] : '';
        $category_label  = isset($settings['category_label']) ? trim((string) $settings['category_label']) : '';
        ?>
        <div class="nevari-product-list-grid-widget">
            <div class="nevari-product-list-grid-widget__grid">
                <?php
                while ($query->have_posts()) :
                    $query->the_post();
                    $product = wc_get_product(get_the_ID());

                    if (!$product instanceof WC_Product) {
                        continue;
                    }

                    $image_url = get_the_post_thumbnail_url($product->get_id(), 'woocommerce_thumbnail');
                    $categories = get_the_terms($product->get_id(), 'product_cat');
                    ?>
                    <article class="nevari-product-list-grid-widget__item">
                        <a class="nevari-products-widget__image-link nevari-product-list-grid-widget__thumb" href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                            <?php if (!empty($image_url)) : ?>
                                <?php echo wp_kses_post($product->get_image('woocommerce_thumbnail', array('loading' => 'lazy'))); ?>
                            <?php else : ?>
                                <?php echo wc_placeholder_img('woocommerce_thumbnail'); ?>
                            <?php endif; ?>
                        </a>

                        <div class="nevari-product-list-grid-widget__content">
                            <?php if ('' !== $category_label) : ?>
                                <div class="nevari-products-widget__categories">
                                    <?php echo esc_html($category_label); ?>
                                </div>
                            <?php elseif (!empty($categories) && !is_wp_error($categories)) : ?>
                                <div class="nevari-products-widget__categories">
                                    <?php
                                    $category_links = array();
                                    foreach ($categories as $category) {
                                        $category_links[] = sprintf(
                                            '<a href="%1$s">%2$s</a>',
                                            esc_url(get_term_link($category)),
                                            esc_html($category->name)
                                        );
                                    }
                                    echo wp_kses_post(implode(', ', $category_links));
                                    ?>
                                </div>
                            <?php endif; ?>

                            <h3 class="nevari-products-widget__title">
                                <a href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                                    <?php echo esc_html($product->get_name()); ?>
                                </a>
                            </h3>

                            <div class="nevari-products-widget__price">
                                <?php echo wp_kses_post($product->get_price_html()); ?>
                            </div>

                            <?php if ($show_button) : ?>
                                <a class="nevari-products-widget__button" href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                                    <?php if ('left' === $settings['button_icon_position']) : ?>
                                        <?php echo $this->render_button_icon($button_icon, $button_icon_url); ?>
                                    <?php endif; ?>
                                    <span class="nevari-products-widget__button-label"><?php echo esc_html($button_label); ?></span>
                                    <?php if ('right' === $settings['button_icon_position']) : ?>
                                        <?php echo $this->render_button_icon($button_icon, $button_icon_url); ?>
                                    <?php endif; ?>
                                </a>
                            <?php endif; ?>
                        </div>
                    </article>
                <?php endwhile; ?>
            </div>

            <?php echo wp_kses_post($this->render_pagination($query, $settings, $alignment, $pagination_mode)); ?>
        </div>
        <?php

        wp_reset_postdata();
    }
}
