import streamlit as st
import numpy as np
import plotly.graph_objects as go

def calculate_intensity(position, slit_width, slit_spacing, num_slits):
    """
    주어진 파라미터에 따라 빛의 강도를 계산합니다.
    (R 코드의 calculate_intensity 함수를 기반으로 함)
    """
    center_positions = np.linspace(
        -(num_slits - 1) / 2 * slit_spacing,
        (num_slits - 1) / 2 * slit_spacing,
        num_slits
    )

    intensity = np.zeros_like(position, dtype=float)
    for i, center_pos in enumerate(center_positions):
        # 바깥쪽 슬릿은 투과율 1, 안쪽은 회절 패턴 추가
        if i == 0 or i == num_slits - 1:
            intensity -= np.exp(-((position - center_pos) / (slit_width / 2))**2)
        else:
            # 회절 효과를 추가한 강도 계산
            intensity -= 1.2 * np.exp(-((position - center_pos) / (slit_width / 2))**2) * (0.5 * np.cos(np.pi * (position - center_pos) / (slit_spacing / 2)) + 0.5)
    return intensity

st.set_page_config(layout="wide")
st.title("노광 장비: Multi-slit 광 분포 및 패터닝 시뮬레이션")

st.markdown("""
이 시뮬레이션은 노광 장비에서 **UV 빛이 슬릿 패턴을 통과할 때의 광 분포**와
이에 따라 **포토레지스트가 어떻게 광 반응을 하여 패터닝되는지**를 보여줍니다.
""")

col1, col2 = st.columns([1, 2])

with col1:
    st.header("시뮬레이션 파라미터")
    # 슬라이더를 사용하여 파라미터 입력
    slit_width = st.slider("슬릿 너비 (nm)", min_value=1, max_value=10, value=5)
    slit_spacing = st.slider("슬릿 간격 (nm)", min_value=5, max_value=20, value=10)
    num_slits = st.number_input("슬릿 개수", min_value=1, value=5, step=1)

with col2:
    st.header("슬릿 패턴")
    # 슬릿 모양 플롯 생성
    x_min_plot = -50
    x_max_plot = 50

    center_positions = np.linspace(
        -(num_slits - 1) / 2 * slit_spacing,
        (num_slits - 1) / 2 * slit_spacing,
        num_slits
    )

    fig_slit = go.Figure()
    for center_pos in center_positions:
        fig_slit.add_shape(
            type="rect",
            x0=center_pos - slit_width / 2,
            y0=-0.5,
            x1=center_pos + slit_width / 2,
            y1=0.5,
            fillcolor="black",
            line=dict(width=0),
        )
    fig_slit.update_layout(
        xaxis=dict(title="위치 (nm)", range=[x_min_plot, x_max_plot]),
        yaxis=dict(showticklabels=False, zeroline=False, range=[-1, 1]),
        height=200,
        margin=dict(l=20, r=20, t=30, b=20)
    )
    st.plotly_chart(fig_slit, use_container_width=True)

st.header("빛의 강도 분포 및 포토레지스트 패터닝")

# x축 위치 생성
position = np.arange(start=-50, stop=50.1, step=0.1)

# 빛의 강도 계산
intensity = calculate_intensity(position, slit_width, slit_spacing, num_slits)

# 플롯 생성 (빛의 강도)
fig_intensity = go.Figure()
fig_intensity.add_trace(go.Scatter(x=position, y=intensity * 0.8 + 1, mode='lines', name='빛의 강도'))
fig_intensity.update_layout(
    xaxis_title="위치 (nm)",
    yaxis_title="강도",
    yaxis_range=[0, 1.5],
    height=400,
    margin=dict(l=20, r=20, t=30, b=20)
)

# 포토레지스트 광 반응 시뮬레이션
# 임계 강도(threshold intensity)를 기준으로 패터닝을 시뮬레이션합니다.
threshold_intensity = 0.8
exposed_regions = (intensity * 0.8 + 1) > threshold_intensity

fig_intensity.add_trace(go.Scatter(
    x=position[exposed_regions],
    y=np.full_like(position[exposed_regions], 0.1),
    mode='markers',
    marker=dict(symbol='square', size=5, color='red'),
    name='패터닝된 영역 (노출)'
))

pattern_y = np.where(exposed_regions, 0.05, 0.95)
fig_intensity.add_trace(go.Scatter(
    x=position,
    y=pattern_y,
    mode='lines',
    line=dict(color='blue', width=5),
    name='포토레지스트 (패터닝 후)'
))

st.plotly_chart(fig_intensity, use_container_width=True)

st.markdown("""
---
### 시뮬레이션 설명:

* **슬릿 패턴**: UV 빛이 통과하는 슬릿의 모양을 보여줍니다. 슬릿 너비, 간격, 개수를 조절하여 변경할 수 있습니다.
* **빛의 강도 분포**: 슬릿을 통과한 UV 빛이 회절 현상에 의해 어떻게 퍼져나가는지(광 분포)를 나타냅니다.
    * **외부 슬릿**: 빛이 거의 그대로 투과되는 것으로 가정합니다.
    * **내부 슬릿**: 회절 효과를 추가하여 빛의 간섭 패턴을 시뮬레이션합니다.
* **포토레지스트 패터닝**: 계산된 빛의 강도 분포에 따라 포토레지스트가 광 반응을 일으켜 패터닝되는 과정을 시뮬레이션합니다.
    * **패터닝된 영역 (노출)**: 빛의 강도가 특정 **임계치(`threshold_intensity`)** 이상인 영역을 표시합니다. 이 임계치를 넘는 부분은 포토레지스트가 반응하여 이후 공정에서 제거되거나 남게 됩니다.
    * **포토레지스트 (패터닝 후)**: 노출된 영역과 노출되지 않은 영역을 시각적으로 구분하여 패터닝 결과를 보여줍니다. 이는 **포지티브(positive) 포토레지스트** (노출된 부분이 제거됨) 또는 **네거티브(negative) 포토레지스트** (노출된 부분이 남음)의 동작을 간략하게 나타낸 것입니다.

### 시뮬레이션 활용:

이 시뮬레이션을 통해 슬릿의 기하학적 구조가 UV 빛의 광 분포에 미치는 영향과,
그 결과로 포토레지스트에 형성되는 미세 패턴의 변화를 직관적으로 이해할 수 있습니다.
예를 들어, 슬릿의 간격이 좁아지거나 개수가 많아지면 빛의 간섭 패턴이 더욱 복잡해지며,
이는 미세한 회로 패턴을 형성하는 데 중요한 영향을 미칩니다.
""")
