<script lang="ts">
  interface Props {
    buttonText: string;
    onClick: () => void;
  }

  let { buttonText, onClick }: Props = $props();
</script>

<button class="cta-button" onclick={onClick}>
  <span class="btn-text">{buttonText}</span>
  <div class="btn-glow"></div>
</button>

<style>
  .cta-button {
    position: relative;
    padding: 12px 32px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 99px;
    color: white;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
  }

  .cta-button:hover {
    border-color: rgba(139, 92, 246, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
  }

  .cta-button:active {
    transform: translateY(0);
  }

  .btn-glow {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transform: translateX(-100%);
    transition: transform 0.5s ease;
  }

  .cta-button:hover .btn-glow {
    transform: translateX(100%);
    transition: transform 0.8s ease;
  }
</style>
